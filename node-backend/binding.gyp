{
  "targets": [{
    "target_name": "algo_engine",
    "sources": [ "bindings/engine_binding.cpp" ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")",
      "../cpp-engine/include"
    ],
    "dependencies": [
      "<!(node -p \"require('node-addon-api').gyp\")"
    ],
    "cflags!":    [ "-fno-exceptions" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "defines":    [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
    "conditions": [
      ["OS!='win'", {
        "cflags_cc": [ "-std=c++17", "-O3", "-march=native", "-pthread" ],
        "libraries": [ "-lpthread" ]
      }],
      ["OS=='mac'", {
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
          "MACOSX_DEPLOYMENT_TARGET": "10.15"
        }
      }],
      ["OS=='win'", {
        "cflags_cc": [],
        "libraries": [],
        "msvs_settings": {
          "VCCLCompilerTool": {
            "ExceptionHandling": 1,
            "AdditionalOptions": ["/std:c++17", "/O2"]
          }
        }
      }]
    ]
  }]
}
