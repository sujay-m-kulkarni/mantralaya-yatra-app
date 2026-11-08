namespace MantralayaYatra.Application.Common;

public enum ErrorKind
{
    Validation,
    TooLarge,
    Forbidden,
    NotFound,
    Conflict,
}

/// <summary>An expected failure, returned rather than thrown. <see cref="Code"/> is stable and goes on the wire.</summary>
public sealed record Error(ErrorKind Kind, string Code, string Message)
{
    public static Error Validation(string code, string message) => new(ErrorKind.Validation, code, message);
    public static Error TooLarge(string code, string message) => new(ErrorKind.TooLarge, code, message);
    public static Error Forbidden(string message) => new(ErrorKind.Forbidden, "forbidden", message);
    public static Error NotFound(string code, string message) => new(ErrorKind.NotFound, code, message);
    public static Error Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
}

public sealed class Result<T>
{
    private readonly T? _value;

    private Result(T? value, Error? error)
    {
        _value = value;
        Error = error;
    }

    public Error? Error { get; }

    public bool IsSuccess => Error is null;

    public T Value => IsSuccess ? _value! : throw new InvalidOperationException($"No value: {Error!.Code}");

    public static Result<T> Success(T value) => new(value, null);

    public static Result<T> Failure(Error error) => new(default, error);

    public static implicit operator Result<T>(T value) => Success(value);

    public static implicit operator Result<T>(Error error) => Failure(error);
}
