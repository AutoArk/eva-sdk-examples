cmake_minimum_required(VERSION 3.16)
project(EvaVoiceDialogueAgent LANGUAGES CXX)
# Local installed-package selection stays in ignored build directories.
find_package(EvaClient 0.1.0 EXACT CONFIG REQUIRED)
find_package(Threads REQUIRED)
add_executable(eva_voice_dialogue_agent src/main.cpp src/sdk_usage.cpp)
target_compile_features(eva_voice_dialogue_agent PRIVATE cxx_std_17)
target_link_libraries(eva_voice_dialogue_agent PRIVATE EVA::Media Threads::Threads)
if(APPLE)
  target_link_options(eva_voice_dialogue_agent PRIVATE
    "LINKER:-sectcreate,__TEXT,__info_plist,${CMAKE_CURRENT_SOURCE_DIR}/Info.plist")
endif()
