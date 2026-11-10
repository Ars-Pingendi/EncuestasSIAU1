import Foundation
import SwiftUI

/// Listas, favoritos y estadísticas de reproducción.
@MainActor
final class UserDataStore: ObservableObject {
    static let shared = UserDataStore()

    @Published private(set) var playlists: [Playlist] = []
    @Published private(set) var favTracks: [String] = []
    @Published private(set) var favAlbums: [String] = []
    @Published private(set) var stats: [String: PlayStat] = [:]

    private struct Saved: Codable {
        var playlists: [Playlist]
        var favTracks: [String]
        var favAlbums: [String]
        var stats: [String: PlayStat]
    }

    private let file = "usuario.json"

    private init() {
        if let s = Storage.load(Saved.self, from: file) {
            playlists = s.playlists
            favTracks = s.favTracks
            favAlbums = s.favAlbums
            stats = s.stats
        }
    }

    private func save() {
        Storage.save(Saved(playlists: playlists, favTracks: favTracks, favAlbums: favAlbums, stats: stats), to: file)
    }

    // MARK: Favoritos

    func isFavorite(_ trackId: String) -> Bool { favTracks.contains(trackId) }
    func isFavoriteAlbum(_ key: String) -> Bool { favAlbums.contains(key) }

    @discardableResult
    func toggleFavorite(_ track: Track) -> Bool {
        if let i = favTracks.firstIndex(of: track.id) {
            favTracks.remove(at: i)
            save()
            return false
        }
        favTracks.insert(track.id, at: 0)
        save()
        return true
    }

    @discardableResult
    func toggleFavoriteAlbum(_ key: String) -> Bool {
        if let i = favAlbums.firstIndex(of: key) {
            favAlbums.remove(at: i)
            save()
            return false
        }
        favAlbums.insert(key, at: 0)
        save()
        return true
    }

    // MARK: Listas

    @discardableResult
    func createPlaylist(_ name: String, tracks: [Track] = []) -> Playlist {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let p = Playlist(id: UUID(), name: clean.isEmpty ? "Nueva lista" : clean, trackIds: tracks.map(\.id), createdAt: Date(), updatedAt: Date())
        playlists.append(p)
        save()
        return p
    }

    func playlist(_ id: UUID) -> Playlist? { playlists.first { $0.id == id } }

    func rename(_ id: UUID, to name: String) {
        guard let i = playlists.firstIndex(where: { $0.id == id }) else { return }
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        playlists[i].name = clean
        playlists[i].updatedAt = Date()
        save()
    }

    func delete(_ id: UUID) {
        playlists.removeAll { $0.id == id }
        save()
    }

    /// Agrega sin duplicar. Devuelve cuántas canciones se agregaron.
    @discardableResult
    func add(_ tracks: [Track], to id: UUID) -> Int {
        guard let i = playlists.firstIndex(where: { $0.id == id }) else { return 0 }
        var existing = Set(playlists[i].trackIds)
        var added = 0
        for t in tracks where !existing.contains(t.id) {
            playlists[i].trackIds.append(t.id)
            existing.insert(t.id)
            added += 1
        }
        playlists[i].updatedAt = Date()
        save()
        return added
    }

    func remove(at offsets: IndexSet, from id: UUID) {
        guard let i = playlists.firstIndex(where: { $0.id == id }) else { return }
        playlists[i].trackIds.remove(atOffsets: offsets)
        playlists[i].updatedAt = Date()
        save()
    }

    func move(from source: IndexSet, to destination: Int, in id: UUID) {
        guard let i = playlists.firstIndex(where: { $0.id == id }) else { return }
        playlists[i].trackIds.move(fromOffsets: source, toOffset: destination)
        playlists[i].updatedAt = Date()
        save()
    }

    // MARK: Estadísticas

    func countPlay(_ track: Track) {
        var s = stats[track.id] ?? PlayStat(plays: 0, last: Date())
        s.plays += 1
        s.last = Date()
        stats[track.id] = s
        save()
    }

    func clearHistory() {
        stats = [:]
        save()
    }
}
