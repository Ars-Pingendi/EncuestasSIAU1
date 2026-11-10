import Foundation

struct EqPreset: Codable, Hashable, Identifiable {
    var id: String { name }
    let name: String
    let bands: [Float]
}

struct EqSettings: Codable, Equatable {
    var enabled = true
    var preset: String? = "Plano"
    var bands: [Float] = Array(repeating: 0, count: 10)
    /// 0…100
    var bass: Float = 0
    /// 0…100
    var width: Float = 0
    /// 0…100
    var loudness: Float = 0
}

/// Mismos preajustes y cálculos que las versiones de Android y Windows.
enum EqMath {
    static let bandsHz: [Float] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    static let labels = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]
    static let maxDb: Float = 12
    static let bassHz: Float = 90
    static let bassMaxDb: Float = 10
    static let loudnessMaxDb: Float = 9
    static let headroom: Float = 0.7
    static let q: Double = 1.41

    static let builtIn: [EqPreset] = [
        EqPreset(name: "Plano", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        EqPreset(name: "Graves potentes", bands: [6, 5.5, 4.5, 2.5, 1, 0, 0, 0, 0, 0]),
        EqPreset(name: "Agudos brillantes", bands: [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 5.5]),
        EqPreset(name: "Loudness", bands: [5, 4, 2.5, 0, -1.5, -1.5, 0, 2.5, 4.5, 5]),
        EqPreset(name: "Vocal", bands: [-3, -2.5, -1.5, 1, 3, 3.5, 3, 1.5, 0, -1]),
        EqPreset(name: "Rock", bands: [4.5, 3.5, 2.5, 1, -1, -1.5, 0.5, 2.5, 3.5, 4.5]),
        EqPreset(name: "Pop", bands: [-1.5, 0, 1.5, 3, 3.5, 3, 1.5, 0, -1, -1.5]),
        EqPreset(name: "Jazz", bands: [3, 2.5, 1, 2, -1.5, -1.5, 0, 1.5, 2.5, 3.5]),
        EqPreset(name: "Clásica", bands: [4, 3.5, 2.5, 1.5, -0.5, -0.5, 0, 2, 3, 3.5]),
        EqPreset(name: "Electrónica", bands: [5, 4.5, 3.5, 0, -1.5, 1.5, 0.5, 1.5, 4.5, 5]),
        EqPreset(name: "Hip hop", bands: [5, 5, 3.5, 3, 0.5, -1, 0.5, 0, 1.5, 3]),
        EqPreset(name: "Acústica", bands: [3, 3, 2.5, 1, 1.5, 1.5, 2.5, 3, 2.5, 1.5]),
        EqPreset(name: "Menos graves", bands: [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0]),
    ]

    static func bassDb(_ s: EqSettings) -> Float { s.bass / 100 * bassMaxDb }
    static func loudnessDb(_ s: EqSettings) -> Float { s.loudness / 100 * loudnessMaxDb }

    /// Reducción automática de ganancia para que los realces no saturen.
    static func preampDb(_ s: EqSettings) -> Float {
        guard s.enabled else { return 0 }
        let maxBoost = max(0, s.bands.max() ?? 0, bassDb(s) * 0.8)
        return -headroom * maxBoost
    }

    // Respuesta en frecuencia (fórmulas RBJ) para dibujar la curva.

    private static func magnitude(_ b0: Double, _ b1: Double, _ b2: Double, _ a0: Double, _ a1: Double, _ a2: Double, _ w: Double) -> Double {
        let c1 = cos(w), s1 = sin(w), c2 = cos(2 * w), s2 = sin(2 * w)
        let nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2)
        let dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2)
        return ((nr * nr + ni * ni) / (dr * dr + di * di)).squareRoot()
    }

    private static func peaking(_ f0: Double, _ gain: Double, _ f: Double, _ fs: Double) -> Double {
        guard gain != 0 else { return 0 }
        let a = pow(10, gain / 40), w0 = 2 * .pi * f0 / fs
        let alpha = sin(w0) / (2 * q), c = cos(w0)
        let m = magnitude(1 + alpha * a, -2 * c, 1 - alpha * a, 1 + alpha / a, -2 * c, 1 - alpha / a, 2 * .pi * f / fs)
        return 20 * log10(m)
    }

    private static func lowShelf(_ f0: Double, _ gain: Double, _ f: Double, _ fs: Double) -> Double {
        guard gain != 0 else { return 0 }
        let a = pow(10, gain / 40), w0 = 2 * .pi * f0 / fs, c = cos(w0)
        let alpha = sin(w0) / 2 * 2.0.squareRoot()
        let sq = 2 * a.squareRoot() * alpha
        let b0 = a * (a + 1 - (a - 1) * c + sq)
        let b1 = 2 * a * (a - 1 - (a + 1) * c)
        let b2 = a * (a + 1 - (a - 1) * c - sq)
        let a0 = a + 1 + (a - 1) * c + sq
        let a1 = -2 * (a - 1 + (a + 1) * c)
        let a2 = a + 1 + (a - 1) * c - sq
        return 20 * log10(magnitude(b0, b1, b2, a0, a1, a2, 2 * .pi * f / fs))
    }

    static func response(_ s: EqSettings, at f: Double, fs: Double = 48000) -> Double {
        guard s.enabled else { return 0 }
        var db = Double(preampDb(s))
        for (i, hz) in bandsHz.enumerated() { db += peaking(Double(hz), Double(s.bands[i]), f, fs) }
        db += lowShelf(Double(bassHz), Double(bassDb(s)), f, fs)
        return db
    }
}
