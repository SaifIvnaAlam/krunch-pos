using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Extensions.DependencyInjection;
using TerminalWin.ViewModels;

namespace TerminalWin.Views;

public sealed partial class LoginPage : Page
{
    public LoginViewModel ViewModel { get; }
    private readonly DispatcherTimer _clockTimer;

    public LoginPage()
    {
        ViewModel = App.Services.GetRequiredService<LoginViewModel>();
        this.InitializeComponent();

        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _clockTimer.Tick += (_, _) => ViewModel.UpdateDateTime();
        _clockTimer.Start();
    }

    private void StaffGrid_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is StaffQuickSelect staff)
            ViewModel.SelectStaffCommand.Execute(staff);
    }
}
