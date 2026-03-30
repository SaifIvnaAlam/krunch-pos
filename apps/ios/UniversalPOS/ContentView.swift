import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Universal POS")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("iPad Terminal")
                    .font(.title2)
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Universal POS")
        }
        .navigationViewStyle(.columns)
    }
}

#Preview {
    ContentView()
}
