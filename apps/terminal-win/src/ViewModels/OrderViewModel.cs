using System.Collections.ObjectModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TerminalWin.Services;
using TerminalWin.Views;

namespace TerminalWin.ViewModels;

public class MenuItemInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string Category { get; set; } = "";
    public bool IsAvailable { get; set; } = true;
    public bool Is86d { get; set; }
    public string PriceDisplay => Price.ToString("C");
    public double ItemOpacity => Is86d ? 0.4 : 1.0;
}

public partial class CategoryInfo : ObservableObject
{
    public string Name { get; set; } = "";
    public ICommand? SelectCommand { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(BackgroundHex))]
    [NotifyPropertyChangedFor(nameof(ForegroundHex))]
    public partial bool IsSelected { get; set; }

    public string BackgroundHex => IsSelected ? "#0369A1" : "#F1F5F9";
    public string ForegroundHex => IsSelected ? "#FFFFFF" : "#334155";
}

public partial class OrderItemDisplay : ObservableObject
{
    [ObservableProperty]
    public partial string Id { get; set; } = "";

    [ObservableProperty]
    public partial string Name { get; set; } = "";

    [ObservableProperty]
    public partial decimal UnitPrice { get; set; }

    [ObservableProperty]
    public partial int Quantity { get; set; } = 1;

    [ObservableProperty]
    public partial string Notes { get; set; } = "";

    [ObservableProperty]
    public partial bool IsExpanded { get; set; }

    public decimal Total => UnitPrice * Quantity;
    public string TotalDisplay => Total.ToString("C");
    public string PriceDisplay => UnitPrice.ToString("C");

    public Action? RemoveRequested { get; set; }
    public Action? QuantityChangedCallback { get; set; }

    partial void OnQuantityChanged(int value)
    {
        OnPropertyChanged(nameof(Total));
        OnPropertyChanged(nameof(TotalDisplay));
        QuantityChangedCallback?.Invoke();
    }

    [RelayCommand]
    private void Increment() => Quantity++;

    [RelayCommand]
    private void Decrement()
    {
        if (Quantity > 1)
            Quantity--;
        else
            RemoveRequested?.Invoke();
    }

    [RelayCommand]
    private void Remove() => RemoveRequested?.Invoke();

    [RelayCommand]
    private void ToggleExpanded() => IsExpanded = !IsExpanded;
}

public partial class OrderViewModel : ObservableObject
{
    private readonly SessionManager _session;
    private readonly AuthService _authService;
    private readonly List<MenuItemInfo> _allMenuItems;
    private int _nextItemId = 1;

    [ObservableProperty]
    public partial string StaffName { get; set; } = "";

    [ObservableProperty]
    public partial string TableLabel { get; set; } = "Table 5";

    [ObservableProperty]
    public partial string OrderStatus { get; set; } = "New Order";

    [ObservableProperty]
    public partial string SelectedCategory { get; set; } = "Popular";

    [ObservableProperty]
    public partial decimal Subtotal { get; set; }

    [ObservableProperty]
    public partial decimal Tax { get; set; }

    [ObservableProperty]
    public partial decimal Total { get; set; }

    [ObservableProperty]
    public partial string SubtotalDisplay { get; set; } = "$0.00";

    [ObservableProperty]
    public partial string TaxDisplay { get; set; } = "$0.00";

    [ObservableProperty]
    public partial string TotalDisplay { get; set; } = "$0.00";

    [ObservableProperty]
    public partial int ItemCount { get; set; }

    public bool IsOrderEmpty => OrderItems.Count == 0;
    public bool HasOrderItems => OrderItems.Count > 0;

    public ObservableCollection<CategoryInfo> Categories { get; } = new();
    public ObservableCollection<MenuItemInfo> FilteredMenuItems { get; } = new();
    public ObservableCollection<OrderItemDisplay> OrderItems { get; } = new();

    public OrderViewModel(SessionManager session, AuthService authService)
    {
        _session = session;
        _authService = authService;
        StaffName = session.StaffName ?? "Staff";
        _allMenuItems = CreateMenuItems();
        InitializeCategories();
        UpdateFilteredItems();
    }

    partial void OnSelectedCategoryChanged(string value)
    {
        foreach (var cat in Categories)
            cat.IsSelected = cat.Name == value;
        UpdateFilteredItems();
    }

    private void InitializeCategories()
    {
        var names = new[] { "Popular", "Mains", "Appetizers", "Sides", "Drinks", "Desserts" };
        foreach (var name in names)
        {
            Categories.Add(new CategoryInfo
            {
                Name = name,
                IsSelected = name == SelectedCategory,
                SelectCommand = new RelayCommand<string>(cat => SelectedCategory = cat!)
            });
        }
    }

    private static List<MenuItemInfo> CreateMenuItems()
    {
        return
        [
            new() { Id = "pop1", Name = "Burger", Price = 12.99m, Category = "Popular" },
            new() { Id = "pop2", Name = "Fries", Price = 4.99m, Category = "Popular" },
            new() { Id = "pop3", Name = "Soda", Price = 2.49m, Category = "Popular" },
            new() { Id = "pop4", Name = "Coffee", Price = 3.49m, Category = "Popular" },

            new() { Id = "main1", Name = "Steak", Price = 24.99m, Category = "Mains" },
            new() { Id = "main2", Name = "Pasta", Price = 14.99m, Category = "Mains" },
            new() { Id = "main3", Name = "Pizza", Price = 16.99m, Category = "Mains" },
            new() { Id = "main4", Name = "Grilled Chicken", Price = 18.99m, Category = "Mains" },
            new() { Id = "main5", Name = "Fish & Chips", Price = 15.99m, Category = "Mains" },
            new() { Id = "main6", Name = "Lamb Chops", Price = 28.99m, Category = "Mains", Is86d = true, IsAvailable = false },

            new() { Id = "app1", Name = "Soup", Price = 6.99m, Category = "Appetizers" },
            new() { Id = "app2", Name = "Salad", Price = 8.99m, Category = "Appetizers" },
            new() { Id = "app3", Name = "Bruschetta", Price = 7.99m, Category = "Appetizers" },
            new() { Id = "app4", Name = "Wings", Price = 10.99m, Category = "Appetizers" },
            new() { Id = "app5", Name = "Calamari", Price = 11.99m, Category = "Appetizers" },

            new() { Id = "side1", Name = "Fries", Price = 4.99m, Category = "Sides" },
            new() { Id = "side2", Name = "Mashed Potato", Price = 5.99m, Category = "Sides" },
            new() { Id = "side3", Name = "Coleslaw", Price = 3.99m, Category = "Sides" },
            new() { Id = "side4", Name = "Rice", Price = 3.49m, Category = "Sides" },
            new() { Id = "side5", Name = "Garlic Bread", Price = 4.49m, Category = "Sides" },

            new() { Id = "drink1", Name = "Soda", Price = 2.49m, Category = "Drinks" },
            new() { Id = "drink2", Name = "Coffee", Price = 3.49m, Category = "Drinks" },
            new() { Id = "drink3", Name = "Beer", Price = 6.99m, Category = "Drinks" },
            new() { Id = "drink4", Name = "Wine", Price = 8.99m, Category = "Drinks" },
            new() { Id = "drink5", Name = "Water", Price = 1.99m, Category = "Drinks" },
            new() { Id = "drink6", Name = "Juice", Price = 3.99m, Category = "Drinks" },

            new() { Id = "des1", Name = "Cheesecake", Price = 7.99m, Category = "Desserts" },
            new() { Id = "des2", Name = "Ice Cream", Price = 5.99m, Category = "Desserts" },
            new() { Id = "des3", Name = "Brownie", Price = 6.49m, Category = "Desserts" },
            new() { Id = "des4", Name = "Tiramisu", Price = 8.99m, Category = "Desserts" },
        ];
    }

    private void UpdateFilteredItems()
    {
        FilteredMenuItems.Clear();
        foreach (var item in _allMenuItems.Where(i => i.Category == SelectedCategory))
            FilteredMenuItems.Add(item);
    }

    public void AddItem(MenuItemInfo menuItem)
    {
        if (menuItem.Is86d || !menuItem.IsAvailable) return;

        var existing = OrderItems.FirstOrDefault(i => i.Name == menuItem.Name && i.UnitPrice == menuItem.Price);
        if (existing != null)
        {
            existing.Quantity++;
        }
        else
        {
            var orderItem = new OrderItemDisplay
            {
                Id = $"oi_{_nextItemId++}",
                Name = menuItem.Name,
                UnitPrice = menuItem.Price,
                Quantity = 1,
            };
            orderItem.RemoveRequested = () =>
            {
                OrderItems.Remove(orderItem);
                RecalculateTotal();
            };
            orderItem.QuantityChangedCallback = RecalculateTotal;
            OrderItems.Add(orderItem);
        }

        RecalculateTotal();
    }

    [RelayCommand]
    private void RemoveItem(OrderItemDisplay item)
    {
        OrderItems.Remove(item);
        RecalculateTotal();
    }

    [RelayCommand]
    private void SendToKitchen()
    {
        if (OrderItems.Count == 0) return;
        OrderStatus = "Sent to Kitchen";
    }

    [RelayCommand]
    private void HoldOrder()
    {
        if (OrderItems.Count == 0) return;
        OrderStatus = "On Hold";
    }

    [RelayCommand]
    private void GoToPayment()
    {
        if (OrderItems.Count == 0) return;

        _session.PendingOrderItems.Clear();
        foreach (var item in OrderItems)
        {
            _session.PendingOrderItems.Add(new PendingOrderItem
            {
                Name = item.Name,
                Quantity = item.Quantity,
                UnitPrice = item.UnitPrice,
            });
        }
        _session.PendingSubtotal = Subtotal;
        _session.PendingTax = Tax;
        _session.PendingTotal = Total;

        _session.NavigateTo(typeof(PaymentPage));
    }

    [RelayCommand]
    private void GoBack()
    {
        _session.NavigateTo(typeof(LoginPage));
    }

    [RelayCommand]
    private async Task LogoutAsync()
    {
        try { await _authService.LogoutAsync(); }
        catch { /* best-effort */ }

        _session.ClearSession();
        _session.NavigateTo(typeof(LoginPage));
    }

    public void ClearOrder()
    {
        OrderItems.Clear();
        OrderStatus = "New Order";
        RecalculateTotal();
    }

    private void RecalculateTotal()
    {
        Subtotal = OrderItems.Sum(i => i.Total);
        Tax = Math.Round(Subtotal * 0.10m, 2);
        Total = Subtotal + Tax;
        SubtotalDisplay = Subtotal.ToString("C");
        TaxDisplay = Tax.ToString("C");
        TotalDisplay = Total.ToString("C");
        ItemCount = OrderItems.Sum(i => i.Quantity);
        OnPropertyChanged(nameof(IsOrderEmpty));
        OnPropertyChanged(nameof(HasOrderItems));
    }
}
