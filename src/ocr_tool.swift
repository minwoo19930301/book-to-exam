import Foundation
import Vision
import AppKit

// Check command line arguments
guard CommandLine.arguments.count > 1 else {
    fputs("Usage: ocr_tool <image_path>\n", stderr)
    print("[]")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: url),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    fputs("Error: Failed to load image at \(imagePath)\n", stderr)
    print("[]")
    exit(1)
}

// Configure Apple Vision Text Recognition Request
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "zh-Hans", "zh-Hant", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Error: Vision request failed: \(error)\n", stderr)
    print("[]")
    exit(1)
}

var results: [[String: Any]] = []
if let observations = request.results {
    for obs in observations {
        let box = obs.boundingBox
        let candidate = obs.topCandidates(1).first?.string ?? ""
        results.append([
            "text": candidate,
            "x": Double(box.origin.x),
            "y": Double(box.origin.y),
            "w": Double(box.size.width),
            "h": Double(box.size.height)
        ])
    }
}

do {
    let jsonData = try JSONSerialization.data(withJSONObject: results, options: [])
    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
} catch {
    print("[]")
}
