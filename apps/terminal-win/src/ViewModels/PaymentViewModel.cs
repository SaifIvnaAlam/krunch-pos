using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TerminalWin.Services;
using TerminalWin.Views;

namespace TerminalWin.ViewModels;

public partial class PaymentViewModel : ObservableObject
{
    private readonly SessionManager _session;

    [ObservableProperty]
    public partial decimal Subtotal { get; set; }

    [ObservableProperty]
    public partial decimal Tax { get; set; }

    [ObservableProperty]
    public partial decimal Tip { get; set; }

    [ObservableProperty]
    public partial string SelectedPaymentMethod { get; set; } = "Cash";

    [ObservableProperty]
    public partial string SelectedTipOption { get; set; } = "None";

    [ObservableProperty]
    public partial string CashTenderedText { get; set; } = "";

    [ObservableProperty]
    public partial decimal CashTendered { get; set; }

    [ObservableProperty]
    public partial decimal ChangeOwed { get; set; }

    [ObservableProperty]
    public partial bool IsProcessing { get; set; }

    [ObservableProperty]
    public partial bool IsPaymentComplete { get; set; }

    [ObservableProperty]
    public partial string CustomTipText { get; set; } = "";

    public string SubtotalDisplay => Subtotal.ToString("C");
    public string TaxDisplay => Tax.ToString("C");
    public string TipDisplay => Tip.ToString("C");
    public decimal GrandTotal => Subtotal + Tax + Tip;
    public string GrandTotalDisplay => GrandTotal.ToString("C");
    public string ChangeOwedDisplay => ChangeOwed.ToString("C");

    public bool IsCashMethod => SelectedPaymentMethod == "Cash";
    public bool IsCardMethod => SelectedPaymentMethod == "Card";

    public bool IsTipNone => SelectedTipOption == "None";
    public bool IsTip10 => SelectedTipOption == "10%";
    public bool IsTip15 => SelectedTipOption == "15%";
    public bool IsTip20 => SelectedTipOption == "20%";
    public bool IsTipCustom => SelectedTipOption == "Custom";

    public bool CanProcessPayment =>
        !IsProcessing && (SelectedPaymentMethod == "Card" || CashTendered >= GrandTotal);

    public ObservableCollection<OrderItemDisplay> OrderItems { get; } = new();

    public PaymentViewModel(SessionManager session)
    {
        _session = session;
        LoadOrderData();
    }

    private void LoadOrderData()
    {
        foreach (var item in _session.PendingOrderItems)
        {
            OrderItems.Add(new OrderItemDisplay
            {
                Name = item.Name,
                Quantity = item.Quantity,
                UnitPrice = item.UnitPrice,
            });
        }
        Subtotal = _session.PendingSubtotal;
        Tax = _session.PendingTax;
    }

    partial void OnTipChanged(decimal value)
    {
        OnPropertyChanged(nameof(TipDisplay));
        OnPropertyChanged(nameof(GrandTotal));
        OnPropertyChanged(nameof(GrandTotalDisplay));
        OnPropertyChanged(nameof(CanProcessPayment));
        RecalculateChange();
    }

    partial void OnCashTenderedTextChanged(string value)
    {
        CashTendered = decimal.TryParse(value.TrimStart('$'), out var amount) ? amount : 0;
    }

    partial void OnCashTenderedChanged(decimal value)
    {
        RecalculateChange();
        OnPropertyChanged(nameof(CanProcessPayment));
    }

    partial void OnSelectedPaymentMethodChanged(string value)
    {
        OnPropertyChanged(nameof(IsCashMethod));
        OnPropertyChanged(nameof(IsCardMethod));
        OnPropertyChanged(nameof(CanProcessPayment));
    }

    partial void OnSelectedTipOptionChanged(string value)
    {
        OnPropertyChanged(nameof(IsTipNone));
        OnPropertyChanged(nameof(IsTip10));
        OnPropertyChanged(nameof(IsTip15));
        OnPropertyChanged(nameof(IsTip20));
        OnPropertyChanged(nameof(IsTipCustom));

        Tip = value switch
        {
            "None" => 0m,
            "10%" => Math.Round(Subtotal * 0.10m, 2),
            "15%" => Math.Round(Subtotal * 0.15m, 2),
            "20%" => Math.Round(Subtotal * 0.20m, 2),
            "Custom" => Tip,
            _ => 0m,
        };
    }

    partial void OnCustomTipTextChanged(string value)
    {
        if (SelectedTipOption == "Custom" && decimal.TryParse(value, out var amount))
            Tip = Math.Max(0, amount);
    }

    partial void OnIsProcessingChanged(bool value)
    {
        OnPropertyChanged(nameof(CanProcessPayment));
    }

    [RelayCommand]
    private void SelectPaymentMethod(string method)
    {
        SelectedPaymentMethod = method;
    }

    [RelayCommand]
    private void SelectTip(string tipOption)
    {
        SelectedTipOption = tipOption;
    }

    [RelayCommand]
    private void QuickCash(string amount)
    {
        CashTenderedText = amount == "Exact"
            ? GrandTotal.ToString("F2")
            : amount;
    }

    [RelayCommand]
    private async Task ProcessPaymentAsync()
    {
        if (!CanProcessPayment) return;

        IsProcessing = true;
        OnPropertyChanged(nameof(CanProcessPayment));
        await Task.Delay(1500);

        IsProcessing = false;
        IsPaymentComplete = true;

        await Task.Delay(1200);
        _session.PendingOrderItems.Clear();
        _session.NavigateTo(typeof(OrderPage));
    }

    [RelayCommand]
    private void GoBack()
    {
        _session.GoBack();
    }

    private void RecalculateChange()
    {
        ChangeOwed = CashTendered > GrandTotal ? CashTendered - GrandTotal : 0m;
        OnPropertyChanged(nameof(ChangeOwedDisplay));
    }
}
