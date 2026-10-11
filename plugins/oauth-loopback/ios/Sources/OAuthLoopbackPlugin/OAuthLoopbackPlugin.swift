import Foundation
import Capacitor
import Network

@objc(OAuthLoopbackPlugin)
public class OAuthLoopbackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OAuthLoopbackPlugin"
    public let jsName = "OAuthLoopback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "waitForCallback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var sessions: [String: LoopbackSession] = [:]

    @objc func start(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? "/auth/callback"
        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        let requestedPort = call.getInt("port")
        let completionUri = call.getString("completionUri")
        let port = UInt16(requestedPort ?? Int(findFreePort()))
        let sessionId = UUID().uuidString
        let redirectUri = "http://127.0.0.1:\(port)\(normalizedPath)"

        let session = LoopbackSession(id: sessionId, port: port, path: normalizedPath, completionUri: completionUri)
        session.start { result in
            switch result {
            case .success:
                self.sessions[sessionId] = session
                call.resolve([
                    "sessionId": sessionId,
                    "redirectUri": redirectUri,
                    "port": Int(port),
                ])
            case .failure(let error):
                call.reject("Failed to start loopback server: \(error.localizedDescription)")
            }
        }
    }

    @objc func waitForCallback(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("sessionId is required")
            return
        }
        guard let session = sessions[sessionId] else {
            call.reject("Unknown session")
            return
        }
        let timeoutMs = call.getDouble("timeoutMs") ?? 300_000
        session.wait(timeoutMs: timeoutMs / 1000.0) { payload in
            if let payload = payload {
                call.resolve(payload)
            } else {
                call.reject("OAuth loopback timed out")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("sessionId is required")
            return
        }
        if let session = sessions.removeValue(forKey: sessionId) {
            session.stop()
        }
        call.resolve()
    }

    private func findFreePort() -> UInt16 {
        var port: UInt16 = 1455
        for _ in 0..<32 {
            if isPortFree(port) {
                return port
            }
            port += 1
        }
        return 1455
    }

    private func isPortFree(_ port: UInt16) -> Bool {
        let socketFD = socket(AF_INET, SOCK_STREAM, 0)
        if socketFD < 0 { return false }
        defer { close(socketFD) }
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(socketFD, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return bindResult == 0
    }
}

private final class LoopbackSession {
    private let id: String
    private let port: UInt16
    private let path: String
    private let completionUri: String?
    private var listener: NWListener?
    private var pendingCallback: (([String: Any]?) -> Void)?
    private var receivedPayload: [String: Any]?

    init(id: String, port: UInt16, path: String, completionUri: String?) {
        self.id = id
        self.port = port
        self.path = path
        self.completionUri = completionUri
    }

    func start(completion: @escaping (Result<Void, Error>) -> Void) {
        do {
            let params = NWParameters.tcp
            params.requiredInterfaceType = .loopback
            let listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
            self.listener = listener
            listener.newConnectionHandler = { [weak self] connection in
                self?.handle(connection: connection)
            }
            listener.stateUpdateHandler = { state in
                if case .ready = state {
                    completion(.success(()))
                } else if case .failed(let error) = state {
                    completion(.failure(error))
                }
            }
            listener.start(queue: .global())
        } catch {
            completion(.failure(error))
        }
    }

    func wait(timeoutMs: Double, completion: @escaping ([String: Any]?) -> Void) {
        if let payload = receivedPayload {
            completion(payload)
            return
        }
        pendingCallback = completion
        DispatchQueue.global().asyncAfter(deadline: .now() + timeoutMs) { [weak self] in
            guard let self = self else { return }
            if self.receivedPayload == nil {
                self.pendingCallback?(nil)
                self.pendingCallback = nil
            }
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handle(connection: NWConnection) {
        connection.start(queue: .global())
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let self = self, let data = data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            let firstLine = request.split(separator: "\n", maxSplits: 1).first ?? ""
            let parts = firstLine.split(separator: " ")
            guard parts.count >= 2 else {
                connection.cancel()
                return
            }
            let target = String(parts[1])
            let url = URL(string: "http://127.0.0.1\(target)")
            let payload = Self.parseQuery(url: url, expectedPath: self.path)

            // Ignore anything that is not the OAuth callback (favicon.ico, retries)
            // so a stray request can never wipe the captured code.
            guard payload["code"] != nil || payload["error"] != nil else {
                Self.respond(connection, status: "404 Not Found", headers: [], body: "Not found")
                return
            }
            if self.receivedPayload == nil {
                self.receivedPayload = payload
                self.pendingCallback?(payload)
                self.pendingCallback = nil
            }

            if let completion = self.completionUri {
                // Bounce to the app scheme so ASWebAuthenticationSession closes by itself.
                Self.respond(connection, status: "302 Found", headers: ["Location: \(completion)"], body: "")
            } else {
                Self.respond(connection, status: "200 OK", headers: ["Content-Type: text/html; charset=utf-8"], body: Self.donePage)
            }
        }
    }

    private static let donePage = """
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f4f6fb;font:17px -apple-system,system-ui,sans-serif;text-align:center}p{color:#98a1b3}</style>
    </head><body><div><h2>You're signed in</h2><p>You can close this window and return to Auto Browse.</p></div></body></html>
    """

    private static func respond(_ connection: NWConnection, status: String, headers: [String], body: String) {
        var head = "HTTP/1.1 \(status)\r\n"
        for header in headers + ["Content-Length: \(body.utf8.count)", "Cache-Control: no-store", "Connection: close"] {
            head += header + "\r\n"
        }
        let response = head + "\r\n" + body
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func parseQuery(url: URL?, expectedPath: String) -> [String: Any] {
        guard let url = url else { return [:] }
        guard url.path == expectedPath else { return [:] }
        var result: [String: Any] = [:]
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        for item in items {
            guard let value = item.value else { continue }
            switch item.name {
            case "code": result["code"] = value
            case "state": result["state"] = value
            case "client_id": result["clientId"] = value
            case "error": result["error"] = value
            case "error_description": result["errorDescription"] = value
            default: break
            }
        }
        return result
    }
}
