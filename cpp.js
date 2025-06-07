const fs = require('fs');
const path = require('path');

/**
 * Save export.hpp, extract.hpp, keys.hpp, and extractAll.hpp into out_cpp directory
 * @param {Object} params
 * @param {string} params.out_cpp - path to output C++ header directory
 * @param {Object} params.keys - object with { keys, bin, files } parsed
 */
module.exports = function cpp({ out_cpp, keys }) {
  const { keys: keysMap, bin, files } = keys;

  // keys.hpp
  const keysHpp = `#pragma once
// Auto-generated keys.hpp

#include <unordered_map>
#include <string>

namespace fmod_keys {
  static const std::unordered_map<std::string, int> bin = {
${Object.entries(bin).map(([k, v]) => `    {"${k}", ${v}}`).join(',\n')}
  };

  static const std::unordered_map<char, std::string> keys = {
${Object.entries(keysMap).map(([ch, key]) => {
  const esc = ch === '"' ? '\\"' : ch === '\\' ? '\\\\' : ch;
  return `    {'${esc}', "${key}"}`;
}).join(',\n')}
  };
}
`;

  // export.hpp
  const exportHpp = `#pragma once
// Auto-generated export.hpp

#include <string>
#include <vector>

namespace fmod_export {
  struct FileMeta {
    std::string path;
    size_t offset;
    size_t length;
    bool binary;
  };

  static const std::vector<FileMeta> files = {
${files.map(f =>
  `    {"${f.path}", ${f.offset}, ${f.length}, ${f.binary ? 'true' : 'false'}}`
).join(',\n')}
  };
}
`;

  // extract.hpp (with keys.hpp included)
  const extractHpp = `#pragma once
// Auto-generated extract.hpp

#include "keys.hpp"
#include <string>
#include <fstream>
#include <vector>
#include <stdexcept>

namespace fmod_extract {
  std::vector<char> readFileRange(const std::string& file, size_t offset, size_t length) {
    std::ifstream in(file, std::ios::binary);
    if (!in) throw std::runtime_error("Failed to open " + file);
    in.seekg(offset);
    std::vector<char> buffer(length);
    in.read(buffer.data(), length);
    if (!in) throw std::runtime_error("Failed to read data from " + file);
    return buffer;
  }
}
`;

  // extractAll.hpp (new)
  const extractAllHpp = `#pragma once
// Auto-generated extractAll.hpp

#include "extract.hpp"
#include "export.hpp"
#include <fstream>
#include <iostream>
#include <filesystem>

namespace fmod_extract_all {

  // Extract all files from the big file archive
  // Parameters:
  // - fmodFilePath: path to the .fmod archive file
  // - outputDir: directory to write extracted files into
  // - skipBinary: whether to skip files marked as binary (default true)
  inline void extractAll(const std::string& fmodFilePath, const std::string& outputDir, bool skipBinary = true) {
    namespace fs = std::filesystem;

    std::ifstream in(fmodFilePath, std::ios::binary);
    if (!in) {
      std::cerr << "Failed to open archive file: " << fmodFilePath << std::endl;
      return;
    }

    size_t extractedCount = 0;
    size_t skippedCount = 0;

    for (const auto& fileMeta : fmod_export::files) {
      if (skipBinary && fileMeta.binary) {
        ++skippedCount;
        std::cout << "[skip binary] " << fileMeta.path << std::endl;
        continue;
      }

      try {
        in.seekg(fileMeta.offset);
        std::vector<char> buffer(fileMeta.length);
        in.read(buffer.data(), fileMeta.length);
        if (!in) {
          std::cerr << "Failed to read data for " << fileMeta.path << std::endl;
          continue;
        }

        fs::path outPath = fs::path(outputDir) / fs::path(fileMeta.path);
        fs::create_directories(outPath.parent_path());

        std::ofstream out(outPath, std::ios::binary);
        if (!out) {
          std::cerr << "Failed to open output file: " << outPath << std::endl;
          continue;
        }

        out.write(buffer.data(), buffer.size());
        if (!out) {
          std::cerr << "Failed to write data to: " << outPath << std::endl;
          continue;
        }

        std::cout << "[extracted] " << fileMeta.path << std::endl;
        ++extractedCount;
      }
      catch (const std::exception& e) {
        std::cerr << "Exception processing " << fileMeta.path << ": " << e.what() << std::endl;
      }
    }

    std::cout << "\nExtraction complete.\n";
    std::cout << "  Files extracted: " << extractedCount << std::endl;
    std::cout << "  Files skipped (binary): " << skippedCount << std::endl;
  }
}
`;

  // Ensure output dir exists
  fs.mkdirSync(out_cpp, { recursive: true });

  // Write all .hpp files
  const filesWritten = {
    'keys.hpp': path.join(out_cpp, 'keys.hpp'),
    'export.hpp': path.join(out_cpp, 'export.hpp'),
    'extract.hpp': path.join(out_cpp, 'extract.hpp'),
    'extractAll.hpp': path.join(out_cpp, 'extractAll.hpp'),
  };

  fs.writeFileSync(filesWritten['keys.hpp'], keysHpp);
  fs.writeFileSync(filesWritten['export.hpp'], exportHpp);
  fs.writeFileSync(filesWritten['extract.hpp'], extractHpp);
  fs.writeFileSync(filesWritten['extractAll.hpp'], extractAllHpp);

  // Console log
  console.log('\n🛠️  C++ headers generated:');
  Object.entries(filesWritten).forEach(([name, fullPath]) => {
    console.log(`  ✅ ${name} → ${fullPath}`);
  });

  console.log(`\n📊 Stats:`);
  console.log(`  🔡 Characters encoded: ${Object.keys(keysMap).length}`);
  console.log(`  🧩 Bin entries:        ${Object.keys(bin).length}`);
  console.log(`  📄 Files listed:       ${files.length}`);

  console.log(`\nℹ️  Note: extractAll.hpp skips binary files by default to avoid data errors.\n`);
};
