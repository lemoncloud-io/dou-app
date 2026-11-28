import Cocoa
import Foundation
func kids(_ root: Int32) -> Set<Int32> {
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/ps"); p.arguments = ["-axo", "pid=,ppid="]
    let pipe = Pipe(); p.standardOutput = pipe; try? p.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
    let s = String(data: data, encoding: .utf8) ?? ""
    var m: [Int32: [Int32]] = [:]
    for l in s.split(separator: "\n") { let f = l.split(separator: " "); if f.count == 2, let a = Int32(f[0]), let b = Int32(f[1]) { m[b, default: []].append(a) } }
    var out: Set<Int32> = [root]; var q = [root]
    while let c = q.popLast() { for k in m[c] ?? [] where !out.contains(k) { out.insert(k); q.append(k) } }
    return out
}
if CommandLine.arguments[1] == "scheme" {
    print((LSCopyDefaultHandlerForURLScheme(CommandLine.arguments[2] as CFString)?.takeRetainedValue() as String?) ?? "")
    exit(0)
}
let root = Int32(CommandLine.arguments[1])!
let limit = Double(CommandLine.arguments[2])!
let t0 = Date().timeIntervalSince1970
while Date().timeIntervalSince1970 - t0 < limit {
    let pids = kids(root)
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
    for w in list {
        guard let pid = w[kCGWindowOwnerPID as String] as? Int32, pids.contains(pid),
              let b = w[kCGWindowBounds as String] as? [String: Any],
              let width = b["Width"] as? Double, let height = b["Height"] as? Double,
              (w[kCGWindowLayer as String] as? Int) == 0, width > 300, height > 300 else { continue }
        print(Int(Date().timeIntervalSince1970 * 1000)); exit(0)
    }
    usleep(20000)
}
print("timeout"); exit(1)
