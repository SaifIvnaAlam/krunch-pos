using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TerminalWin.Services;

public class ApiService
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;
    private string? _accessToken;

    public ApiService()
    {
        _client = new HttpClient
        {
            BaseAddress = new Uri("http://localhost:3000/api/v1/"),
            Timeout = TimeSpan.FromSeconds(10)
        };

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };
    }

    public void SetAccessToken(string? token)
    {
        _accessToken = token;
        _client.DefaultRequestHeaders.Authorization = token != null
            ? new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token)
            : null;
    }

    public async Task<T?> PostAsync<T>(string endpoint, object body, CancellationToken ct = default)
    {
        var response = await _client.PostAsJsonAsync(endpoint, body, _jsonOptions, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(_jsonOptions, ct);
    }

    public async Task<T?> GetAsync<T>(string endpoint, CancellationToken ct = default)
    {
        var response = await _client.GetAsync(endpoint, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(_jsonOptions, ct);
    }

    public async Task PostAsync(string endpoint, object? body = null, CancellationToken ct = default)
    {
        var response = body != null
            ? await _client.PostAsJsonAsync(endpoint, body, _jsonOptions, ct)
            : await _client.PostAsync(endpoint, null, ct);
        response.EnsureSuccessStatusCode();
    }
}
