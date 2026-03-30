using Microsoft.UI.Xaml.Controls;
using Microsoft.Extensions.DependencyInjection;
using TerminalWin.ViewModels;

namespace TerminalWin.Views;

public sealed partial class PaymentPage : Page
{
    public PaymentViewModel ViewModel { get; }

    public PaymentPage()
    {
        ViewModel = App.Services.GetRequiredService<PaymentViewModel>();
        this.InitializeComponent();
    }
}
