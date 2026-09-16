cmake_minimum_required(VERSION 3.16)
project(EvaVoiceDialogueAgent LANGUAGES CXX)
# Local installed-package selection stays in ignored build directories.
set(EVA_SDK_VERSION "0.1.0")
set(EVA_REQUIRED_SDK_VERSION "${EVA_SDK_VERSION}")
if(DEFINED EVA_LOCAL_SDK_VERSION AND NOT EVA_LOCAL_SDK_VERSION STREQUAL "")
  set(EVA_REQUIRED_SDK_VERSION "${EVA_LOCAL_SDK_VERSION}")
endif()
find_package(EvaClient ${EVA_REQUIRED_SDK_VERSION} EXACT CONFIG REQUIRED)
find_package(Threads REQUIRED)
add_executable(eva_voice_dialogue_agent
  src/commands.cpp
  src/event_output.cpp
  src/main.cpp
  src/options.cpp
  src/sdk_usage.cpp)
target_compile_features(eva_voice_dialogue_agent PRIVATE cxx_std_17)
target_link_libraries(eva_voice_dialogue_agent PRIVATE EVA::Media Threads::Threads)
if(APPLE)
  set_property(TARGET eva_voice_dialogue_agent APPEND PROPERTY LINK_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist")
  target_link_options(eva_voice_dialogue_agent PRIVATE
    "LINKER:-sectcreate,__TEXT,__info_plist,${CMAKE_CURRENT_SOURCE_DIR}/Info.plist")
endif()
