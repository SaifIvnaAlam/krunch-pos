cmake_minimum_required(VERSION 3.16)
project(UniversalPOSTerminal VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS
    Core Quick Widgets Network WebSockets Sql Nfc SerialPort
)

qt_standard_project_setup()

qt_add_executable(terminal-qt
    src/main.cpp
)

target_link_libraries(terminal-qt PRIVATE
    Qt6::Core
    Qt6::Quick
    Qt6::Widgets
    Qt6::Network
    Qt6::WebSockets
    Qt6::Sql
    Qt6::Nfc
    Qt6::SerialPort
)

install(TARGETS terminal-qt
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
