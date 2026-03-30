import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    width: 1024
    height: 768
    visible: true
    title: "Universal POS Terminal"

    StackView {
        id: stackView
        anchors.fill: parent

        initialItem: Item {
            ColumnLayout {
                anchors.centerIn: parent
                spacing: 20

                Label {
                    text: "Universal POS Terminal"
                    font.pixelSize: 32
                    font.bold: true
                    Layout.alignment: Qt.AlignHCenter
                }

                Label {
                    text: "Qt 6 / C++ Edition"
                    font.pixelSize: 16
                    color: "#666"
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }
    }
}
