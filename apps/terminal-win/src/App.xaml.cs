using Microsoft.UI.Xaml;
using Microsoft.Extensions.DependencyInjection;
using TerminalWin.Services;
using TerminalWin.ViewModels;

namespace TerminalWin;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    public App()
    {
        try
        {
            this.InitializeComponent();
        }
        catch (Exception ex)
        {
            System.IO.File.WriteAllText(
                System.IO.Path.Combine(AppContext.BaseDirectory, "crash-init.log"), ex.ToString());
            throw;
        }
        this.UnhandledException += OnUnhandledException;
        Services = ConfigureServices();
    }

    private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        var msg = e.Exception?.ToString() ?? "Unknown error";
        System.IO.File.WriteAllText(
            System.IO.Path.Combine(AppContext.BaseDirectory, "crash.log"), msg);
        e.Handled = true;
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            m_window = new MainWindow();
            m_window.Activate();
        }
        catch (Exception ex)
        {
            System.IO.File.WriteAllText(
                System.IO.Path.Combine(AppContext.BaseDirectory, "crash.log"), ex.ToString());
            throw;
        }
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();

        services.AddSingleton<ApiService>();
        services.AddSingleton<AuthService>();
        services.AddSingleton<SessionManager>();

        services.AddTransient<LoginViewModel>();
        services.AddTransient<TableSelectionViewModel>();
        services.AddSingleton<OrderViewModel>();
        services.AddTransient<PaymentViewModel>();

        return services.BuildServiceProvider();
    }

    private Window? m_window;
}
