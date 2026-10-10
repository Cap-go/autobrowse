// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapgoCapacitorInappbrowser", path: "../../../node_modules/@capgo/capacitor-inappbrowser"),
        .package(name: "CapgoNativeNavigation", path: "../../../node_modules/@capgo/native-navigation"),
        .package(name: "CapacitorSecureStoragePlugin", path: "../../../node_modules/capacitor-secure-storage-plugin"),
        .package(name: "CapgoOauthLoopback", path: "../../../node_modules/@capgo/oauth-loopback")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapgoCapacitorInappbrowser", package: "CapgoCapacitorInappbrowser"),
                .product(name: "CapgoNativeNavigation", package: "CapgoNativeNavigation"),
                .product(name: "CapacitorSecureStoragePlugin", package: "CapacitorSecureStoragePlugin"),
                .product(name: "CapgoOauthLoopback", package: "CapgoOauthLoopback")
            ]
        )
    ]
)
