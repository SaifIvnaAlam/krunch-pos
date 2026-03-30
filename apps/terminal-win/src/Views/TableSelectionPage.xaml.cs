using Microsoft.UI.Xaml.Controls;
using Microsoft.Extensions.DependencyInjection;
using TerminalWin.ViewModels;

namespace TerminalWin.Views;

public sealed partial class TableSelectionPage : Page
{
    public TableSelectionViewModel ViewModel { get; }

    public TableSelectionPage()
    {
        ViewModel = App.Services.GetRequiredService<TableSelectionViewModel>();
        this.InitializeComponent();
    }

    private void TableGrid_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is TableInfo table)
            ViewModel.SelectTableCommand.Execute(table);
    }
}
