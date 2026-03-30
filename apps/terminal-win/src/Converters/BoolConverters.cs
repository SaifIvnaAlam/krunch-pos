using System.Globalization;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;

namespace TerminalWin.Converters;

public class InverseBoolConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
        => value is bool b ? !b : value;

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => value is bool b ? !b : value;
}

public class StringToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
        => string.IsNullOrEmpty(value as string) ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

public class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var result = value is true;
        if (parameter is string s && (s.Equals("invert", StringComparison.OrdinalIgnoreCase) || s.Equals("inverse", StringComparison.OrdinalIgnoreCase)))
            result = !result;
        return result ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Converts a hex color string (e.g. "#0369A1") to a SolidColorBrush.
/// </summary>
public class HexColorToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is string hex && !string.IsNullOrEmpty(hex))
            return ParseBrush(hex);
        return new SolidColorBrush(Colors.Transparent);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();

    internal static SolidColorBrush ParseBrush(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 8)
        {
            var a = byte.Parse(hex[0..2], NumberStyles.HexNumber);
            var r = byte.Parse(hex[2..4], NumberStyles.HexNumber);
            var g = byte.Parse(hex[4..6], NumberStyles.HexNumber);
            var b = byte.Parse(hex[6..8], NumberStyles.HexNumber);
            return new SolidColorBrush(new Windows.UI.Color { A = a, R = r, G = g, B = b });
        }
        if (hex.Length == 6)
        {
            var r = byte.Parse(hex[0..2], NumberStyles.HexNumber);
            var g = byte.Parse(hex[2..4], NumberStyles.HexNumber);
            var b = byte.Parse(hex[4..6], NumberStyles.HexNumber);
            return new SolidColorBrush(new Windows.UI.Color { A = 255, R = r, G = g, B = b });
        }
        return new SolidColorBrush(Colors.Transparent);
    }
}

/// <summary>
/// Converts a bool to a SolidColorBrush using a ConverterParameter in format "#trueColor|#falseColor".
/// Example: ConverterParameter='#0369A1|#F1F5F9'
/// </summary>
public class BoolToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var isTrue = value is true;
        if (parameter is string p)
        {
            var parts = p.Split('|');
            if (parts.Length == 2)
            {
                var hex = isTrue ? parts[0].Trim() : parts[1].Trim();
                return HexColorToBrushConverter.ParseBrush(hex);
            }
        }
        return new SolidColorBrush(Colors.Transparent);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

public class StringMatchToBrushConverter : IValueConverter
{
    private static readonly SolidColorBrush AccentBrush =
        new(new Windows.UI.Color { A = 255, R = 3, G = 105, B = 161 });

    private static readonly SolidColorBrush NeutralBrush =
        new(new Windows.UI.Color { A = 255, R = 241, G = 245, B = 249 });

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        bool isMatch = string.Equals(value?.ToString(), parameter?.ToString(), StringComparison.OrdinalIgnoreCase);
        return isMatch ? AccentBrush : NeutralBrush;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

public class StringMatchToFgConverter : IValueConverter
{
    private static readonly SolidColorBrush ActiveFg =
        new(Colors.White);

    private static readonly SolidColorBrush InactiveFg =
        new(new Windows.UI.Color { A = 255, R = 30, G = 41, B = 59 });

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        bool isMatch = string.Equals(value?.ToString(), parameter?.ToString(), StringComparison.OrdinalIgnoreCase);
        return isMatch ? ActiveFg : InactiveFg;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}
