import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BrowserBridgeViewController()
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

class BrowserBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        if let webView = bridge?.webView {
            let host = BrowserHostView(frame: webView.frame)
            host.backgroundColor = .systemBackground
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view = host
            host.addSubview(webView)
        }
        bridge?.registerPluginInstance(BrowserLayoutPlugin())
    }
}

class BrowserHostView: UIView {
    private var browserOverlays: [UIView] {
        subviews.filter { $0.next is UINavigationController }
    }

    override func didAddSubview(_ subview: UIView) {
        super.didAddSubview(subview)
        if subview.next is UINavigationController {
            subview.layer.zPosition = 1
        }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let fallback = super.hitTest(point, with: event) else { return nil }
        for overlay in browserOverlays.reversed() {
            if let target = overlay.hitTest(convert(point, to: overlay), with: event) {
                return target
            }
        }
        return fallback
    }
}

@objc(BrowserLayoutPlugin)
class BrowserLayoutPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BrowserLayoutPlugin"
    let jsName = "BrowserLayout"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getOrigin", returnType: CAPPluginReturnPromise)
    ]

    @objc func getOrigin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView,
                  let window = webView.window else {
                call.reject("Browser layout is not ready")
                return
            }
            let origin = webView.convert(CGPoint.zero, to: window)
            call.resolve(["x": origin.x, "y": origin.y])
        }
    }
}
