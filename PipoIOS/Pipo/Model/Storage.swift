import CryptoKit
import Foundation
import UIKit

enum AppPaths {
    static let documents: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

    static let support: URL = {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Pipo", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static let artwork: URL = {
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("caratulas", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static var shareTemp: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("compartir", isDirectory: true)
    }
}

/// Archivos JSON en «Application Support» (listas, favoritos, ecualizador, cola…).
enum Storage {
    static func url(_ name: String) -> URL { AppPaths.support.appendingPathComponent(name) }

    static func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func save<T: Encodable>(_ value: T, to name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url(name), options: .atomic)
    }
}

func sha1Hex(_ text: String) -> String { sha1Hex(Data(text.utf8)) }

func sha1Hex(_ data: Data) -> String {
    Insecure.SHA1.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

/// Carátulas reducidas guardadas en la caché.
enum ArtCache {
    private static let memory: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 400
        return c
    }()

    static func fileURL(_ key: String) -> URL { AppPaths.artwork.appendingPathComponent("\(key).jpg") }

    static func image(_ key: String?) -> UIImage? {
        guard let key else { return nil }
        if let img = memory.object(forKey: key as NSString) { return img }
        guard let img = UIImage(contentsOfFile: fileURL(key).path) else { return nil }
        memory.setObject(img, forKey: key as NSString)
        return img
    }

    /// Guarda la imagen (reducida a 600 px) y devuelve su clave.
    @discardableResult
    static func store(_ data: Data, key: String? = nil) -> String? {
        let k = key ?? String(sha1Hex(data).prefix(20))
        let url = fileURL(k)
        if FileManager.default.fileExists(atPath: url.path) { return k }
        guard let img = UIImage(data: data), let jpg = downscaled(img) else { return nil }
        try? jpg.write(to: url, options: .atomic)
        return k
    }

    @discardableResult
    static func store(image: UIImage, key: String) -> String? {
        let url = fileURL(key)
        if FileManager.default.fileExists(atPath: url.path) { return key }
        guard let jpg = downscaled(image) else { return nil }
        try? jpg.write(to: url, options: .atomic)
        return key
    }

    private static func downscaled(_ img: UIImage, maxSide: CGFloat = 600) -> Data? {
        let longest = max(img.size.width, img.size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, maxSide / longest)
        let size = CGSize(width: (img.size.width * scale).rounded(), height: (img.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.85)
    }
}
