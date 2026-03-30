using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using TerminalWin.Services;
using TerminalWin.Views;

namespace TerminalWin.ViewModels;

public enum OrderType { DineIn, Takeaway, Delivery }

public enum TableStatus { Available, Occupied, Reserved }

public class TableInfo
{
    public int Number { get; set; }
    public int Seats { get; set; }
    public TableStatus Status { get; set; }
    public string OrderTotal { get; set; } = "";

    public string DisplayNumber => $"T{Number}";
    public string DisplaySeats => $"{Seats} seats";
    public bool IsReserved => Status == TableStatus.Reserved;

    public string StatusDisplay => Status switch
    {
        TableStatus.Available => "Available",
        TableStatus.Occupied => "Occupied",
        TableStatus.Reserved => "Reserved",
        _ => ""
    };

    public string BackgroundColor => Status switch
    {
        TableStatus.Available => "#FFFFFF",
        TableStatus.Occupied => "#DBEAFE",
        TableStatus.Reserved => "#FEF3C7",
        _ => "#FFFFFF"
    };

    public string BorderColor => Status switch
    {
        TableStatus.Available => "#22C55E",
        TableStatus.Occupied => "#3B82F6",
        TableStatus.Reserved => "#F59E0B",
        _ => "#E5E7EB"
    };
}

public partial class TableSelectionViewModel : ObservableObject
{
    private readonly SessionManager _session;
    private readonly AuthService _authService;

    [ObservableProperty]
    public partial string StaffName { get; set; } = "";

    [ObservableProperty]
    public partial string StaffInitial { get; set; } = "?";

    [ObservableProperty]
    public partial OrderType SelectedOrderType { get; set; } = OrderType.DineIn;

    [ObservableProperty]
    public partial bool IsDineIn { get; set; } = true;

    [ObservableProperty]
    public partial bool IsTakeaway { get; set; }

    [ObservableProperty]
    public partial bool IsDelivery { get; set; }

    [ObservableProperty]
    public partial string CustomerName { get; set; } = "";

    [ObservableProperty]
    public partial string CustomerPhone { get; set; } = "";

    public ObservableCollection<TableInfo> Tables { get; } = new();

    public TableSelectionViewModel(SessionManager session, AuthService authService)
    {
        _session = session;
        _authService = authService;
        StaffName = session.StaffName ?? "Staff";
        StaffInitial = StaffName.Length > 0 ? StaffName[..1].ToUpper() : "?";
        LoadTables();
    }

    private void LoadTables()
    {
        for (int i = 1; i <= 20; i++)
        {
            var status = i switch
            {
                3 => TableStatus.Occupied,
                7 => TableStatus.Occupied,
                12 => TableStatus.Reserved,
                _ => TableStatus.Available
            };
            Tables.Add(new TableInfo
            {
                Number = i,
                Seats = i <= 10 ? 4 : 6,
                Status = status,
                OrderTotal = status == TableStatus.Occupied ? "$45.50" : ""
            });
        }
    }

    [RelayCommand]
    private void SelectOrderType(string type)
    {
        SelectedOrderType = type switch
        {
            "DineIn" => OrderType.DineIn,
            "Takeaway" => OrderType.Takeaway,
            "Delivery" => OrderType.Delivery,
            _ => OrderType.DineIn
        };
        IsDineIn = SelectedOrderType == OrderType.DineIn;
        IsTakeaway = SelectedOrderType == OrderType.Takeaway;
        IsDelivery = SelectedOrderType == OrderType.Delivery;
    }

    [RelayCommand]
    private void SelectTable(TableInfo table)
    {
        if (table.Status == TableStatus.Reserved) return;
        _session.NavigateTo(typeof(OrderPage));
    }

    [RelayCommand]
    private void StartNewOrder()
    {
        _session.NavigateTo(typeof(OrderPage));
    }

    [RelayCommand]
    private async Task LogoutAsync()
    {
        try { await _authService.LogoutAsync(); } catch { }
        _session.ClearSession();
        _session.NavigateTo(typeof(LoginPage));
    }
}
