// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "UniversalPOS",
    platforms: [.iOS(.v17)],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.0.0"),
        .package(url: "https://github.com/nicklockwood/Starscream.git", from: "4.0.0"),
        .package(url: "https://github.com/stripe/stripe-ios.git", from: "23.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "UniversalPOS",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Starscream", package: "Starscream"),
                .product(name: "Stripe", package: "stripe-ios"),
            ],
            path: "UniversalPOS"
        ),
    ]
)
