import AVFoundation
import Foundation

/// Copias con nombre legible («Artista - Título.m4a») para compartir con otras apps.
enum Sharing {
    static func fileName(for track: Track, ext: String) -> String {
        let artist = track.displayArtist == unknownArtist ? "" : track.displayArtist
        let parts = [artist, track.title.isEmpty ? "Canción" : track.title].filter { !$0.isEmpty }
        var base = parts.joined(separator: " - ")
        for ch in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"] { base = base.replacingOccurrences(of: ch, with: "_") }
        base = String(base.trimmingCharacters(in: .whitespacesAndNewlines).prefix(110))
        return "\(base.isEmpty ? "Canción" : base).\(ext)"
    }

    static func prepare(_ tracks: [Track]) async -> [URL] {
        let fm = FileManager.default
        try? fm.removeItem(at: AppPaths.shareTemp)
        let dir = AppPaths.shareTemp.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        var out: [URL] = []
        for track in tracks {
            switch track.source {
            case .file:
                guard let src = track.fileURL else { continue }
                let dest = LibraryScanner.uniqueURL(dir.appendingPathComponent(fileName(for: track, ext: src.pathExtension.lowercased())))
                if (try? fm.copyItem(at: src, to: dest)) != nil { out.append(dest) }
            case .library:
                guard let src = await MainActor.run(body: { LibraryStore.shared.playableURL(for: track) }) else { continue }
                let dest = LibraryScanner.uniqueURL(dir.appendingPathComponent(fileName(for: track, ext: "m4a")))
                if await export(src, to: dest) { out.append(dest) }
            }
        }
        return out
    }

    /// Las canciones de la app Música se exportan a M4A (no se pueden copiar directamente).
    private static func export(_ src: URL, to dest: URL) async -> Bool {
        guard let session = AVAssetExportSession(asset: AVURLAsset(url: src), presetName: AVAssetExportPresetAppleM4A) else { return false }
        session.outputURL = dest
        session.outputFileType = .m4a
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { cont.resume() }
        }
        return session.status == .completed
    }
}
