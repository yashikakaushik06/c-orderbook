cmake_minimum_required(VERSION 3.16)
project(AlgoEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

if(NOT MSVC)
  set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG")
else()
  set(CMAKE_CXX_FLAGS_RELEASE "/O2 /DNDEBUG")
endif()

include_directories(include)

add_library(algo_engine_lib STATIC src/engine.cpp)
target_include_directories(algo_engine_lib PUBLIC include)
if(NOT WIN32)
  target_link_libraries(algo_engine_lib pthread)
endif()

add_executable(engine_bench src/bench.cpp)
target_link_libraries(engine_bench algo_engine_lib)
if(NOT WIN32)
  target_link_libraries(engine_bench pthread)
endif()
