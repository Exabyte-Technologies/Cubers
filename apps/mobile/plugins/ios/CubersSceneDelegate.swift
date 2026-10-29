// Cubers scene lifecycle begin
import UIKit
// One scene owns the window; the app delegate retains Expo's subscriber chain.
final class CubersSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let app else { return }
    window = app.cubersConnect(to: windowScene, options: options)
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      _ = app?.application(UIApplication.shared, open: context.url, options: Self.urlOptions(context))
    }
  }

  func scene(_ scene: UIScene, continue activity: NSUserActivity) {
    _ = app?.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }

  func scene(_ scene: UIScene, willContinueUserActivityWithType type: String) {
    _ = app?.application(UIApplication.shared, willContinueUserActivityWithType: type)
  }

  func scene(_ scene: UIScene, didFailToContinueUserActivityWithType type: String, error: Error) {
    app?.application(UIApplication.shared, didFailToContinueUserActivityWithType: type, error: error)
  }

  func scene(_ scene: UIScene, didUpdate activity: NSUserActivity) {
    app?.application(UIApplication.shared, didUpdate: activity)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    app?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    app?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    app?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    app?.applicationDidEnterBackground(UIApplication.shared)
  }

  func windowScene(_ scene: UIWindowScene, performActionFor shortcut: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    guard let app else { completionHandler(false); return }
    app.application(UIApplication.shared, performActionFor: shortcut, completionHandler: completionHandler)
  }

  static func urlOptions(_ context: UIOpenURLContext) -> [UIApplication.OpenURLOptionsKey: Any] {
    var result: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
    if let source = context.options.sourceApplication { result[.sourceApplication] = source }
    if let annotation = context.options.annotation { result[.annotation] = annotation }
    return result
  }
}

extension AppDelegate {
  @objc func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Cubers", sessionRole: session.role)
    configuration.sceneClass = UIWindowScene.self
    configuration.delegateClass = CubersSceneDelegate.self
    return configuration
  }

  func cubersConnect(to scene: UIWindowScene, options: UIScene.ConnectionOptions) -> UIWindow {
    // Reattachment must not start a second React host or reset a restored login.
    if let existing = window {
      existing.windowScene = scene
      existing.makeKeyAndVisible()
      let delegate = CubersSceneDelegate()
      delegate.scene(scene, openURLContexts: options.urlContexts)
      for activity in options.userActivities {
        delegate.scene(scene, continue: activity)
      }
      return existing
    }
    guard let factory = reactNativeFactory else { preconditionFailure("React factory was not initialized") }
    var launch = cubersLaunchOptions ?? [:]
    if let context = options.urlContexts.first {
      launch[.url] = context.url
      if let source = context.options.sourceApplication { launch[.sourceApplication] = source }
      if let annotation = context.options.annotation { launch[.annotation] = annotation }
    }
    if let activity = options.userActivities.first {
      launch[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }
    if let shortcut = options.shortcutItem { launch[.shortcutItem] = shortcut }
    let created = UIWindow(windowScene: scene)
    window = created
    factory.startReactNative(withModuleName: "main", in: created, launchOptions: launch)
    cubersLaunchOptions = nil
    // Notify Expo subscribers once. React Native receives cold links through
    // launch options; the legacy app-delegate fallback is only for warm links.
    for context in options.urlContexts {
      _ = cubersNotifyInitialURL(context)
    }
    for activity in options.userActivities {
      cubersNotifyInitialActivity(activity)
    }
    if let shortcut = options.shortcutItem {
      application(UIApplication.shared, performActionFor: shortcut, completionHandler: { _ in })
    }
    return created
  }
}
// Cubers scene lifecycle end
