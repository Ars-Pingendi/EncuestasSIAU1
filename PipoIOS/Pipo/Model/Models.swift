import Foundation
import SwiftUI

let unknownArtist = "Artista desconocido"
let unknownGenre = "Sin género"

enum TrackSource: String, Codable {
    /// Archivo dentro de la carpeta de Pipo (Archivos, iCloud, WhatsApp, Windows…).
    case file
    /// Canción de la app Música del iPhone (sin protección DRM).
    case library
}

struct Track: Identifiable, Codable, Hashable {
    let id: String
    var source: TrackSource
    var title: String
    var artist: String
    var album: String
    var albumArtist: String
    var genre: String
    var trackNo: Int
    var discNo: Int
    var year: Int
    var duration: Double
    /// Ruta relativa a Documentos (solo archivos).
    var relativePath: String
    /// Identificador de la app Música (solo biblioteca).
    var persistentID: UInt64
    var albumPersistentID: UInt64
    var addedAt: Date
    var artKey: String?

    var displayArtist: String {
        if !artist.isEmpty { return artist }
        if !albumArtist.isEmpty { return albumArtist }
        return unknownArtist
    }

    var subtitle: String {
        album.isEmpty ? displayArtist : "\(displayArtist) · \(album)"
    }

    /// Carpeta que contiene el archivo, relativa a Documentos ("" = raíz).
    var folder: String {
        source == .library ? "Música del iPhone" : (relativePath as NSString).deletingLastPathComponent
    }

    var fileURL: URL? {
        source == .file ? AppPaths.documents.appendingPathComponent(relativePath) : nil
    }

    var albumKey: String {
        if source == .library && albumPersistentID != 0 { return "m:\(albumPersistentID)" }
        let a = album.lowercased()
        return albumArtist.isEmpty ? "f:\(folder.lowercased())|\(a)" : "aa:\(albumArtist.lowercased())|\(a)"
    }

    var artistKey: String { displayArtist.lowercased() }

    var searchText: String { "\(title) \(displayArtist) \(album) \(genre)".folded }
}

struct Album: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let title: String
    let artist: String
    let year: Int
    let artKey: String?
    let tracks: [Track]
    var duration: Double { tracks.reduce(0) { $0 + $1.duration } }
}

struct Artist: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let name: String
    let tracks: [Track]
    let albums: [Album]
    let artKey: String?
}

struct TrackGroup: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let name: String
    let subtitle: String
    let tracks: [Track]
    let artKey: String?
}

struct Playlist: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var trackIds: [String]
    var createdAt: Date
    var updatedAt: Date
}

struct PlayStat: Codable, Hashable {
    var plays: Int
    var last: Date
}

enum SongSort: String, CaseIterable, Identifiable {
    case title, artist, album, recent, duration
    var id: String { rawValue }
    var label: String {
        switch self {
        case .title: return "Título"
        case .artist: return "Artista"
        case .album: return "Álbum"
        case .recent: return "Agregadas recientemente"
        case .duration: return "Duración"
        }
    }
}

enum LibrarySection: String, CaseIterable, Identifiable {
    case songs, albums, artists, genres, folders
    var id: String { rawValue }
    var title: String {
        switch self {
        case .songs: return "Canciones"
        case .albums: return "Álbumes"
        case .artists: return "Artistas"
        case .genres: return "Géneros"
        case .folders: return "Carpetas"
        }
    }
}

extension String {
    /// Para buscar sin importar tildes ni mayúsculas.
    var folded: String { folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es")) }

    func before(_ other: String) -> Bool { localizedStandardCompare(other) == .orderedAscending }
}

func formatTime(_ seconds: Double) -> String {
    guard seconds.isFinite, seconds > 0 else { return "0:00" }
    let total = Int(seconds)
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}

func formatLong(_ seconds: Double) -> String {
    let minutes = Int((seconds / 60).rounded())
    return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h \(minutes % 60) min"
}

func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

enum Theme {
    static let accent = Color("AccentColor")
}

extension Color {
    /// Color estable derivado de un texto (carátulas de reemplazo).
    static func seeded(_ text: String) -> Color {
        var h: UInt32 = 5381
        for b in text.utf8 { h = (h &* 33) &+ UInt32(b) }
        return Color(hue: Double(h % 360) / 360, saturation: 0.45, brightness: 0.55)
    }
}
