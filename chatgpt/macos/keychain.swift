import Foundation
import Security

// Secrets travel through stdin/stdout only, never through process arguments.
// The launcher captures read results internally. This helper serves only this app.
do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 8192,
          let request = try JSONSerialization.jsonObject(with: data) as? [String: String],
          let operation = request["operation"],
          let account = request["account"],
          ["icloud", "openai-runtime"].contains(account) else { throw NSError(domain: "input", code: 1) }
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "de.rehkopf.icloud-chatgpt",
        kSecAttrAccount as String: account
    ]
    var status: OSStatus
    if operation == "write" {
        guard let secret = request["secret"], !secret.isEmpty else { throw NSError(domain: "input", code: 2) }
        let attributes = [kSecValueData as String: Data(secret.utf8)]
        status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = Data(secret.utf8)
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
    } else if operation == "read" {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess, let value = result as? Data {
            FileHandle.standardOutput.write(value)
        }
    } else if operation == "delete" {
        status = SecItemDelete(query as CFDictionary)
        if status == errSecItemNotFound { status = errSecSuccess }
    } else { throw NSError(domain: "input", code: 3) }
    guard status == errSecSuccess else {
        // No raw exception or input is ever emitted.
        FileHandle.standardError.write(Data("Keychain access failed (\(status)).\n".utf8))
        exit(1)
    }
} catch {
    FileHandle.standardError.write(Data("Invalid Keychain request.\n".utf8))
    exit(1)
}
