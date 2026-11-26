import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Capacitor's web view, zoomed in on big screens (iPads) like a browser's zoom: the page is laid
// out smaller and drawn larger, so the game, made for phones (a column of at most 480px), fills
// an iPad. As much zoom as leaves a page of at least 440 x 700: as wide as a big phone, and tall
// enough for the level screen (678, plus the status and home bars). On an iPad the height
// decides (about 2x, a 525 x 700 page). Phones stay at 1x. (The app is portrait only and takes
// the whole screen, see Info.plist; it still works the zoom out from the window's size whenever
// that changes, so it would follow a rotation too.) The same rule on Android: MainActivity.java.
class GameViewController: CAPBridgeViewController {
    private let minWidth: CGFloat = 440
    private let minHeight: CGFloat = 700

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let size = view.bounds.size
        let zoom = max(1, min(size.width / minWidth, size.height / minHeight))
        if let webView = webView, abs(webView.pageZoom - zoom) > 0.01 {
            webView.pageZoom = zoom
        }
    }
}
