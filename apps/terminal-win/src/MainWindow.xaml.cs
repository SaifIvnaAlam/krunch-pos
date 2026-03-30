using Microsoft.UI.Xaml;
using TerminalWin.Services;
using TerminalWin.Views;
using Microsoft.Extensions.DependencyInjection;

namespace TerminalWin;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        this.InitializeComponent();
        this.Title = "Universal POS Terminal";

        try
        {
            var session = App.Services.GetRequiredService<SessionManager>();
            session.NavigationRequested += OnNavigationRequested;
            session.BackRequested += OnBackRequested;

            ContentFrame.Navigate(typeof(LoginPage));
        }
        catch (Exception ex)
        {
            System.IO.File.WriteAllText(
                System.IO.Path.Combine(AppContext.BaseDirectory, "crash-nav.log"), ex.ToString());
            ContentFrame.Content = new Microsoft.UI.Xaml.Controls.TextBlock
            {
                Text = $"Startup error: {ex.Message}",
                Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Red),
                FontSize = 18
            };
        }
    }

    private void OnNavigationRequested(object? sender, Type pageType)
    {
        ContentFrame.Navigate(pageType);
    }

    private void OnBackRequested(object? sender, EventArgs e)
    {
        if (ContentFrame.CanGoBack)
            ContentFrame.GoBack();
    }
}
