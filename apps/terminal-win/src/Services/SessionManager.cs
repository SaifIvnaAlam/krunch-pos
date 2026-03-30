namespace TerminalWin.Services;

public class PendingOrderItem
{
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Total => UnitPrice * Quantity;
    public string TotalDisplay => Total.ToString("C");
    public string PriceDisplay => UnitPrice.ToString("C");
    public string QuantityDisplay => $"{Quantity}\u00d7";
}

public class SessionManager
{
    public string? StaffId { get; private set; }
    public string? StaffName { get; private set; }
    public string? BranchId { get; set; }
    public string TerminalId { get; set; } = Guid.NewGuid().ToString();
    public string[] Roles { get; private set; } = [];
    public string[] Permissions { get; private set; } = [];
    public bool IsLoggedIn => StaffId != null;

    public List<PendingOrderItem> PendingOrderItems { get; } = new();
    public decimal PendingSubtotal { get; set; }
    public decimal PendingTax { get; set; }
    public decimal PendingTotal { get; set; }

    public event EventHandler<Type>? NavigationRequested;
    public event EventHandler? BackRequested;

    public void SetSession(LoginResponse loginResponse)
    {
        StaffId = loginResponse.StaffProfile.Id;
        StaffName = loginResponse.StaffProfile.Name;
        Roles = loginResponse.Roles;
        Permissions = loginResponse.Permissions;

        if (loginResponse.StaffProfile.PrimaryBranchId != null)
            BranchId = loginResponse.StaffProfile.PrimaryBranchId;
    }

    public void SetOfflineSession(string staffId, string staffName, string[] roles, string[] permissions)
    {
        StaffId = staffId;
        StaffName = staffName;
        Roles = roles;
        Permissions = permissions;
    }

    public void ClearSession()
    {
        StaffId = null;
        StaffName = null;
        Roles = [];
        Permissions = [];
    }

    public bool HasPermission(string permission)
    {
        return Permissions.Contains("*") || Permissions.Contains(permission);
    }

    public void NavigateTo(Type pageType)
    {
        NavigationRequested?.Invoke(this, pageType);
    }

    public void GoBack()
    {
        BackRequested?.Invoke(this, EventArgs.Empty);
    }
}
