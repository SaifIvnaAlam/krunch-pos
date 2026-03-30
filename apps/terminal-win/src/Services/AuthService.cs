using System.Text.Json.Serialization;

namespace TerminalWin.Services;

public record LoginRequest(string StaffId, string Pin, string TerminalId, string BranchId);

public record LoginResponse
{
    [JsonPropertyName("accessToken")]
    public string AccessToken { get; init; } = "";

    [JsonPropertyName("refreshToken")]
    public string RefreshToken { get; init; } = "";

    [JsonPropertyName("staffProfile")]
    public StaffProfile StaffProfile { get; init; } = new();

    [JsonPropertyName("roles")]
    public string[] Roles { get; init; } = [];

    [JsonPropertyName("permissions")]
    public string[] Permissions { get; init; } = [];
}

public record StaffProfile
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("email")]
    public string? Email { get; init; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; init; }

    [JsonPropertyName("primaryBranchId")]
    public string? PrimaryBranchId { get; init; }
}

public class AuthService
{
    private readonly ApiService _api;

    public AuthService(ApiService api)
    {
        _api = api;
    }

    public async Task<LoginResponse> LoginWithPinAsync(
        string staffId, string pin, string terminalId, string branchId, CancellationToken ct = default)
    {
        var request = new LoginRequest(staffId, pin, terminalId, branchId);
        var response = await _api.PostAsync<LoginResponse>("auth/login", request, ct);

        if (response == null)
            throw new InvalidOperationException("Login failed: empty response");

        _api.SetAccessToken(response.AccessToken);
        return response;
    }

    public async Task LogoutAsync(CancellationToken ct = default)
    {
        try
        {
            await _api.PostAsync("auth/logout", null, ct);
        }
        finally
        {
            _api.SetAccessToken(null);
        }
    }
}
