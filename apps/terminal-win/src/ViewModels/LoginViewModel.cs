using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using TerminalWin.Services;
using TerminalWin.Views;

namespace TerminalWin.ViewModels;

public class StaffQuickSelect
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Initials { get; set; } = "";
    public string Role { get; set; } = "";
    public string AvatarColor { get; set; } = "#0369A1";
}

public partial class LoginViewModel : ObservableObject
{
    private readonly AuthService _authService;
    private readonly SessionManager _session;
    private string _pinValue = "";

    [ObservableProperty]
    public partial string StaffId { get; set; } = "";

    [ObservableProperty]
    public partial string SelectedStaffName { get; set; } = "";

    [ObservableProperty]
    public partial string PinDisplay { get; set; } = "";

    [ObservableProperty]
    public partial string ErrorMessage { get; set; } = "";

    [ObservableProperty]
    public partial bool IsLoading { get; set; }

    [ObservableProperty]
    public partial bool IsPinPadVisible { get; set; }

    [ObservableProperty]
    public partial bool IsOtherStaffMode { get; set; }

    [ObservableProperty]
    public partial bool IsOnline { get; set; } = true;

    [ObservableProperty]
    public partial string CurrentTime { get; set; } = "";

    [ObservableProperty]
    public partial string CurrentDate { get; set; } = "";

    public ObservableCollection<StaffQuickSelect> CachedStaff { get; } = new();

    public LoginViewModel(AuthService authService, SessionManager session)
    {
        _authService = authService;
        _session = session;
        LoadCachedStaff();
        UpdateDateTime();
    }

    private void LoadCachedStaff()
    {
        var colors = new[] { "#0369A1", "#7C3AED", "#059669", "#DC2626", "#D97706", "#2563EB" };
        CachedStaff.Add(new StaffQuickSelect
        {
            Id = "default-owner",
            Name = "Default Owner",
            Initials = "DO",
            Role = "Owner",
            AvatarColor = colors[0]
        });
    }

    public void UpdateDateTime()
    {
        CurrentTime = DateTime.Now.ToString("HH:mm");
        CurrentDate = DateTime.Now.ToString("dddd, MMMM d, yyyy");
    }

    [RelayCommand]
    private void SelectStaff(StaffQuickSelect staff)
    {
        StaffId = staff.Id;
        SelectedStaffName = staff.Name;
        IsPinPadVisible = true;
        IsOtherStaffMode = false;
        ErrorMessage = "";
        _pinValue = "";
        PinDisplay = "";
    }

    [RelayCommand]
    private void ShowOtherStaff()
    {
        IsOtherStaffMode = true;
        IsPinPadVisible = true;
        SelectedStaffName = "";
        StaffId = "";
        ErrorMessage = "";
        _pinValue = "";
        PinDisplay = "";
    }

    [RelayCommand]
    private void ClosePinPad()
    {
        IsPinPadVisible = false;
        IsOtherStaffMode = false;
        ErrorMessage = "";
        _pinValue = "";
        PinDisplay = "";
    }

    [RelayCommand]
    private void AppendDigit(string digit)
    {
        if (_pinValue.Length >= 6) return;
        _pinValue += digit;
        PinDisplay = new string('\u25CF', _pinValue.Length);
        ErrorMessage = "";
    }

    [RelayCommand]
    private void ClearPin()
    {
        _pinValue = "";
        PinDisplay = "";
        ErrorMessage = "";
    }

    [RelayCommand]
    private void Backspace()
    {
        if (_pinValue.Length == 0) return;
        _pinValue = _pinValue[..^1];
        PinDisplay = new string('\u25CF', _pinValue.Length);
    }

    [RelayCommand]
    private async Task LoginAsync()
    {
        if (string.IsNullOrWhiteSpace(StaffId))
        {
            ErrorMessage = "Please enter a Staff ID";
            return;
        }
        if (_pinValue.Length < 4)
        {
            ErrorMessage = "PIN must be at least 4 digits";
            return;
        }

        IsLoading = true;
        ErrorMessage = "";

        try
        {
            var branchId = _session.BranchId ?? "default-branch";
            var result = await _authService.LoginWithPinAsync(
                StaffId, _pinValue, _session.TerminalId, branchId);

            _session.SetSession(result);
            _session.NavigateTo(typeof(TableSelectionPage));
        }
        catch
        {
            // Offline fallback: accept known staff with correct PIN locally
            if (StaffId == "default-owner" && _pinValue == "1234")
            {
                _session.SetOfflineSession(StaffId, "Default Owner", ["OWNER"], ["*"]);
                _session.BranchId = "branch-001";
                IsLoading = false;
                _pinValue = "";
                PinDisplay = "";
                _session.NavigateTo(typeof(TableSelectionPage));
                return;
            }

            ErrorMessage = "Invalid PIN or Staff ID (offline mode)";
        }
        finally
        {
            IsLoading = false;
            _pinValue = "";
            PinDisplay = "";
        }
    }
}
