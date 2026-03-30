using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Extensions.DependencyInjection;
using TerminalWin.ViewModels;

namespace TerminalWin.Views;

public sealed partial class OrderPage : Page
{
    public OrderViewModel ViewModel { get; }

    public OrderPage()
    {
        ViewModel = App.Services.GetRequiredService<OrderViewModel>();
        this.InitializeComponent();
    }

    private void MenuItemButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: MenuItemInfo item })
            ViewModel.AddItem(item);
    }
}
