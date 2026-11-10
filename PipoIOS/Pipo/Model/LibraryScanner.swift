import AVFoundation
import Foundation
import MediaPlayer

/// Lectura de la música: archivos dentro de Pipo y biblioteca de la app Música.
/// Todo se ejecuta fuera del hilo principal.
enum LibraryScanner {
    static let audioExtensions: Set<String> = ["mp3", "m4a", "aac", "mp4", "m4b", "wav", "aif", "aiff", "aifc", "flac", "caf"]
    private static let coverNames = ["cover", "folder", "front", "album", "albumart", "portada", "caratula"]

    struct FileEntry {
        let url: URL
        let relativePath: String
        let size: Int
        let modified: Date
        let created: Date
    }

    struct CacheEntry: Codable {
        let size: Int
        let modified: Date
        let track: Track
    }

    struct Meta {
        var title = "", artist = "", album = "", albumArtist = "", genre = ""
        var trackNo = 0, discNo = 0, year = 0
        var duration = 0.0
        var artwork: Data?
    }

    // MARK: Archivos

    static func listAudioFiles(in root: URL) -> [FileEntry] {
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey, .creationDateKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else {
            return []
        }
        let rootPath = root.resolvingSymlinksInPath().path
        var out: [FileEntry] = []
        for case let url as URL in enumerator {
            guard audioExtensions.contains(url.pathExtension.lowercased()) else { continue }
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
            let full = url.resolvingSymlinksInPath().path
            var rel = full.hasPrefix(rootPath) ? String(full.dropFirst(rootPath.count)) : url.lastPathComponent
            while rel.hasPrefix("/") { rel.removeFirst() }
            out.append(FileEntry(
                url: url,
                relativePath: rel,
                size: values.fileSize ?? 0,
                modified: values.contentModificationDate ?? Date(),
                created: values.creationDate ?? Date()
            ))
        }
        return out
    }

    static func trackID(forRelativePath rel: String) -> String {
        "f:" + String(sha1Hex(rel.lowercased()).prefix(16))
    }

    static func makeTrack(_ f: FileEntry, _ m: Meta, addedAt: Date?) -> Track {
        let base = (f.relativePath as NSString).lastPathComponent
        let name = (base as NSString).deletingPathExtension
        let folder = (f.relativePath as NSString).deletingLastPathComponent
        var artKey: String?
        if let data = m.artwork { artKey = ArtCache.store(data) }
        if artKey == nil { artKey = folderArt(f.url.deletingLastPathComponent()) }
        return Track(
            id: trackID(forRelativePath: f.relativePath),
            source: .file,
            title: m.title.isEmpty ? name : m.title,
            artist: m.artist,
            album: m.album.isEmpty ? (folder.isEmpty ? "Archivos importados" : (folder as NSString).lastPathComponent) : m.album,
            albumArtist: m.albumArtist,
            genre: m.genre,
            trackNo: m.trackNo,
            discNo: m.discNo,
            year: m.year,
            duration: m.duration,
            relativePath: f.relativePath,
            persistentID: 0,
            albumPersistentID: 0,
            addedAt: addedAt ?? f.created,
            artKey: artKey
        )
    }

    private static func folderArt(_ dir: URL) -> String? {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return nil }
        let images = names.filter { ["jpg", "jpeg", "png"].contains(($0 as NSString).pathExtension.lowercased()) }
        let pick = images.first { n in coverNames.contains { (n as NSString).deletingPathExtension.lowercased().hasPrefix($0) } }
            ?? (images.count == 1 ? images[0] : nil)
        guard let pick, let data = try? Data(contentsOf: dir.appendingPathComponent(pick)) else { return nil }
        return ArtCache.store(data)
    }

    static func readMetadata(_ url: URL) async -> Meta {
        var m = Meta()
        let asset = AVURLAsset(url: url)
        if let d = try? await asset.load(.duration), d.isNumeric { m.duration = d.seconds }
        let commonItems = (try? await asset.load(.commonMetadata)) ?? []
        let allItems = (try? await asset.load(.metadata)) ?? []

        func common(_ key: AVMetadataKey) -> [AVMetadataItem] { commonItems.filter { $0.commonKey == key } }
        func ids(_ list: [AVMetadataIdentifier]) -> [AVMetadataItem] {
            list.flatMap { AVMetadataItem.metadataItems(from: allItems, filteredByIdentifier: $0) }
        }
        func text(_ items: [AVMetadataItem]) async -> String? {
            for item in items {
                if let s = try? await item.load(.stringValue) {
                    let t = s.replacingOccurrences(of: "\u{0}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                    if !t.isEmpty { return t }
                }
                if let n = try? await item.load(.numberValue) { return n.stringValue }
            }
            return nil
        }
        func pairNumber(_ items: [AVMetadataItem]) async -> Int {
            for item in items {
                if let s = try? await item.load(.stringValue), let n = Int(s.split(separator: "/").first ?? "") { return n }
                if let data = try? await item.load(.dataValue), data.count >= 4 {
                    let bytes = [UInt8](data)
                    return Int(bytes[2]) << 8 | Int(bytes[3])
                }
                if let n = try? await item.load(.numberValue) { return n.intValue }
            }
            return 0
        }

        m.title = await text(common(.commonKeyTitle)) ?? ""
        m.artist = await text(common(.commonKeyArtist)) ?? ""
        m.album = await text(common(.commonKeyAlbumName)) ?? ""
        m.albumArtist = await text(ids([.id3MetadataBand, .iTunesMetadataAlbumArtist])) ?? ""
        m.genre = cleanGenre(await text(ids([.id3MetadataContentType, .iTunesMetadataUserGenre, .quickTimeMetadataGenre])) ?? "")
        m.trackNo = await pairNumber(ids([.id3MetadataTrackNumber, .iTunesMetadataTrackNumber]))
        m.discNo = await pairNumber(ids([.id3MetadataPartOfASet, .iTunesMetadataDiscNumber]))
        let yearText = await text(ids([.id3MetadataYear, .id3MetadataRecordingTime, .iTunesMetadataReleaseDate, .quickTimeMetadataYear]))
        let yearSource: String
        if let yearText {
            yearSource = yearText
        } else {
            yearSource = await text(common(.commonKeyCreationDate)) ?? ""
        }
        if let r = yearSource.range(of: "\\d{4}", options: .regularExpression) { m.year = Int(yearSource[r]) ?? 0 }
        for item in common(.commonKeyArtwork) {
            if let data = try? await item.load(.dataValue) {
                m.artwork = data
                break
            }
        }
        return m
    }

    private static func cleanGenre(_ g: String) -> String {
        // ID3v1 guarda géneros como «(17)»: sin la tabla se descartan.
        let t = g.trimmingCharacters(in: .whitespaces)
        if t.range(of: "^\\(?\\d+\\)?$", options: .regularExpression) != nil { return "" }
        return t
    }

    // MARK: App Música

    static func musicLibraryTracks() -> (tracks: [Track], urls: [UInt64: URL]) {
        guard MPMediaLibrary.authorizationStatus() == .authorized else { return ([], [:]) }
        let items = MPMediaQuery.songs().items ?? []
        var tracks: [Track] = []
        var urls: [UInt64: URL] = [:]
        var albumArt: [UInt64: String] = [:]
        for item in items {
            // Solo canciones descargadas y sin DRM: Apple Music no permite procesar su audio.
            guard let url = item.assetURL, !item.hasProtectedAsset else { continue }
            let pid = item.persistentID
            urls[pid] = url
            var artKey: String?
            if let cached = albumArt[item.albumPersistentID] {
                artKey = cached
            } else if let img = item.artwork?.image(at: CGSize(width: 600, height: 600)) {
                artKey = ArtCache.store(image: img, key: "m\(item.albumPersistentID)")
                albumArt[item.albumPersistentID] = artKey
            }
            let year = item.releaseDate.map { Calendar.current.component(.year, from: $0) } ?? 0
            tracks.append(Track(
                id: "m:\(pid)",
                source: .library,
                title: item.title ?? "Sin título",
                artist: item.artist ?? "",
                album: item.albumTitle ?? "",
                albumArtist: item.albumArtist ?? "",
                genre: item.genre ?? "",
                trackNo: item.albumTrackNumber,
                discNo: item.discNumber,
                year: year,
                duration: item.playbackDuration,
                relativePath: "",
                persistentID: pid,
                albumPersistentID: item.albumPersistentID,
                addedAt: item.dateAdded,
                artKey: artKey
            ))
        }
        return (tracks, urls)
    }

    // MARK: Importar

    /// Copia archivos o carpetas elegidos por el usuario dentro de Pipo. Devuelve cuántas canciones se agregaron.
    static func copyIntoLibrary(_ urls: [URL]) -> Int {
        let fm = FileManager.default
        let docs = AppPaths.documents.resolvingSymlinksInPath().path
        let imported = AppPaths.documents.appendingPathComponent("Importadas", isDirectory: true)
        var count = 0
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let path = url.resolvingSymlinksInPath().path
            if path.hasPrefix(docs) && !path.contains("/Inbox/") { continue } // ya está en Pipo
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else { continue }
            if isDir.boolValue {
                let destRoot = uniqueURL(AppPaths.documents.appendingPathComponent(url.lastPathComponent, isDirectory: true))
                for f in listAudioFiles(in: url) {
                    let dest = destRoot.appendingPathComponent(f.relativePath)
                    try? fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                    if coordinatedCopy(f.url, to: dest) { count += 1 }
                }
            } else if audioExtensions.contains(url.pathExtension.lowercased()) {
                try? fm.createDirectory(at: imported, withIntermediateDirectories: true)
                let dest = uniqueURL(imported.appendingPathComponent(url.lastPathComponent))
                if coordinatedCopy(url, to: dest) {
                    count += 1
                    if path.contains("/Inbox/") { try? fm.removeItem(at: url) }
                }
            }
        }
        return count
    }

    private static func coordinatedCopy(_ src: URL, to dest: URL) -> Bool {
        var ok = false
        var error: NSError?
        NSFileCoordinator().coordinate(readingItemAt: src, options: [], error: &error) { readURL in
            ok = (try? FileManager.default.copyItem(at: readURL, to: dest)) != nil
        }
        return ok
    }

    static func uniqueURL(_ url: URL) -> URL {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path) else { return url }
        let dir = url.deletingLastPathComponent()
        let ext = url.pathExtension
        let base = url.deletingPathExtension().lastPathComponent
        var i = 2
        while true {
            let name = ext.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(ext)"
            let candidate = dir.appendingPathComponent(name)
            if !fm.fileExists(atPath: candidate.path) { return candidate }
            i += 1
        }
    }
}
