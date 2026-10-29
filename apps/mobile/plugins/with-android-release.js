const { withAppBuildGradle } = require("@expo/config-plugins");

const marker = "// Cubers release signing guard";
const reviewMarker = "// Cubers unsigned review build";
const inputsMarker = "// Cubers embedded bundle inputs";
const developmentMarker = "// Cubers standalone development build";
const guard = `
${marker}
// Evaluated at execution time so EAS can inject its release credentials first.
tasks.matching { it.name == 'preReleaseBuild' }.configureEach {
    doFirst {
        def signing = android.buildTypes.release.signingConfig
        if (signing == null || signing.name == 'debug' ||
            signing.storeFile == null || signing.storeFile.name == 'debug.keystore' ||
            signing.keyAlias == null || signing.keyAlias.equalsIgnoreCase('androiddebugkey')) {
            throw new GradleException('Cubers release signing is not configured. Supply release credentials through EAS or your private signing configuration; the Android debug key cannot sign a Cubers release.')
        }
    }
}
`;
const review = `
${reviewMarker}
// Packaging inspection only. Production release keeps its signing guard above.
android.buildTypes {
    review {
        initWith release
        matchingFallbacks = ['release']
        signingConfig = null
        debuggable = false
    }
}
tasks.matching { it.name == 'preReviewBuild' }.configureEach {
    doFirst {
        def review = android.buildTypes.review
        if (review.signingConfig != null || review.debuggable) {
            throw new GradleException('Cubers review builds must be unsigned and non-debuggable. Use the guarded release target for production signing.')
        }
    }
}
`;
const bundleInputs = `
${inputsMarker}
// React Native's default source tree does not include public environment
// settings, static assets or this monorepo's compiled shared workspace.
def cubersWorkspaceRoot = new File(rootDir, '../../..')
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    ['EXPO_PUBLIC_REGION', 'EXPO_PUBLIC_API_URL_INTL', 'EXPO_PUBLIC_API_URL_CN',
     'EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL', 'EXPO_PUBLIC_DEV_TOOLS', 'NODE_ENV', 'EXPO_NO_DOTENV',
     'EXPO_NO_CLIENT_ENV_VARS'].each { name ->
        inputs.property('cubers.' + name,
            providers.environmentVariable(name).map { 'set:' + it }.orElse('unset'))
    }
    inputs.files(fileTree(new File(rootDir, '..')) {
        include 'assets/**', 'src/**/*.json', 'app/**/*.json', '*.json', '*.config.*', '.env', '.env.*'
    }).withPropertyName('cubersMobileResources').withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.files(fileTree(new File(cubersWorkspaceRoot, 'packages/core/dist')) {
        include '**/*.js', '**/*.json'
    }).withPropertyName('cubersSharedRuntime').withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.files(new File(cubersWorkspaceRoot, 'package-lock.json'),
        new File(cubersWorkspaceRoot, 'packages/core/package.json'))
        .withPropertyName('cubersWorkspaceDependencies').withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
}
`;
const development = `
${developmentMarker}
// Embedded JavaScript and the ordinary UI, with our build-gated settings panel.
// This internal target never uses or replaces production release signing.
android.buildTypes {
    development {
        initWith release
        matchingFallbacks = ['release']
        signingConfig = android.signingConfigs.debug
        debuggable = false
    }
}
tasks.matching { it.name == 'preDevelopmentBuild' }.configureEach {
    doFirst {
        if (System.getenv('EXPO_PUBLIC_DEV_TOOLS') != 'true' ||
            android.defaultConfig.applicationId != 'app.cubers.mobile.dev' ||
            android.buildTypes.development.signingConfig?.name != 'debug' ||
            android.buildTypes.development.debuggable) {
            throw new GradleException('Cubers standalone development requires explicit development tools, the separate .dev application ID, embedded code and debug signing.')
        }
    }
}
tasks.matching { it.name == 'preReleaseBuild' }.configureEach {
    doFirst {
        if (System.getenv('EXPO_PUBLIC_DEV_TOOLS') == 'true') {
            throw new GradleException('Use the standalone development target for development tools; they cannot be included in the production release target.')
        }
    }
}
`;

function addReleaseGuard(contents) {
  if (!contents.includes(marker)) contents = contents.trimEnd() + "\n" + guard;
  if (!contents.includes(reviewMarker))
    contents = contents.trimEnd() + "\n" + review;
  if (!contents.includes(inputsMarker))
    contents = contents.trimEnd() + "\n" + bundleInputs;
  // Regenerated projects must track the new public feature gate as a bundle input.
  else if (
    contents.includes("'EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL', 'NODE_ENV'")
  )
    contents = contents.replace(
      "'EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL', 'NODE_ENV'",
      "'EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL', 'EXPO_PUBLIC_DEV_TOOLS', 'NODE_ENV'",
    );
  if (!contents.includes(developmentMarker))
    contents = contents.trimEnd() + "\n" + development;
  else
    contents = contents.replace(
      "signingConfig = signingConfigs.debug",
      "signingConfig = android.signingConfigs.debug",
    );
  return contents;
}

module.exports = function withAndroidRelease(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error(
        "Review Cubers release signing for the new Gradle format",
      );
    mod.modResults.contents = addReleaseGuard(mod.modResults.contents);
    return mod;
  });
};
