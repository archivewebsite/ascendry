param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('protect', 'unprotect')]
  [string]$Mode
)

$ErrorActionPreference = 'Stop'
$inputValue = [Console]::In.ReadToEnd().TrimEnd("`r", "`n")
if ([string]::IsNullOrWhiteSpace($inputValue)) { throw 'No input was provided.' }

Add-Type -AssemblyName System.Security
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser

if ($Mode -eq 'protect') {
  $plainBytes = [Text.Encoding]::UTF8.GetBytes($inputValue)
  try {
    $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, $scope)
    [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
  } finally {
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  }
  exit 0
}

$protectedBytes = [Convert]::FromBase64String($inputValue)
try {
  $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $null, $scope)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
} finally {
  if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
  if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
}
