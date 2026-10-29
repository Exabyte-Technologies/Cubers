const {
  withPodfile,
  withPodfileProperties,
  withXcodeProject,
} = require("@expo/config-plugins");
// Xcode 27 rejects old deployment targets on dependency resource bundles.
// Keep this in prebuild configuration so regenerating ios/ preserves the fix.
module.exports = function withMinimumIos(config) {
  config = withPodfileProperties(config, (mod) => {
    mod.modResults["ios.deploymentTarget"] = "16.0";
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    for (const item of Object.values(
      mod.modResults.pbxXCBuildConfigurationSection(),
    )) {
      if (typeof item !== "object" || !item.buildSettings) continue;
      const existing = item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
      if (
        !existing ||
        Number.parseFloat(String(existing).replaceAll('"', "")) < 16
      )
        item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
    }
    return mod;
  });
  return withPodfile(config, (mod) => {
    const marker = "# Cubers minimum deployment target";
    mod.modResults.contents = mod.modResults.contents.replace(
      /    # Cubers minimum deployment target[\s\S]*?\n    end\n(?=  end\nend\s*$)/,
      "",
    );
    const tail = /\n  end\nend\s*$/;
    if (!tail.test(mod.modResults.contents))
      throw new Error(
        "Review the generated Podfile post_install hook before applying the Cubers deployment target",
      );
    mod.modResults.contents = mod.modResults.contents.replace(
      tail,
      `
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || (current.match?(/\\A\\d+(\\.\\d+)*\\z/) && Gem::Version.new(current) < Gem::Version.new('16.0'))
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
        end
      end
    end
  end
end
`,
    );
    return mod;
  });
};
