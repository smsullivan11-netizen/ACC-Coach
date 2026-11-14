"""Positive ACC process identity. Shared-memory names alone also belong to Assetto Corsa."""
import ctypes
import sys
import time

ACC_EXECUTABLES = frozenset({"ac2-win64-shipping.exe", "ac2-wingdk-shipping.exe"})
AC_EXECUTABLES = frozenset({"acs.exe", "acs_x86.exe"})


def identify_processes(names):
    """Fail closed for unknown games, unreadable process lists, or both simulators running."""
    if names is None:
        return None
    names = {str(n).rsplit("\\", 1)[-1].casefold() for n in names}
    if names & AC_EXECUTABLES:
        return None
    acc = sorted(names & ACC_EXECUTABLES)
    return {"simulator": "acc", "method": "windows-process", "executable": acc[0]} if acc else None


def windows_process_names():
    if sys.platform != "win32":
        return None
    from ctypes import wintypes as w

    class ProcessEntry(ctypes.Structure):
        _fields_ = [("dwSize", w.DWORD), ("cntUsage", w.DWORD), ("th32ProcessID", w.DWORD),
                    ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", w.DWORD),
                    ("cntThreads", w.DWORD), ("th32ParentProcessID", w.DWORD),
                    ("pcPriClassBase", w.LONG), ("dwFlags", w.DWORD), ("szExeFile", w.WCHAR * 260)]

    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
    k.CreateToolhelp32Snapshot.restype = w.HANDLE
    for name in ("Process32FirstW", "Process32NextW"):
        fn = getattr(k, name)
        fn.argtypes = [w.HANDLE, ctypes.POINTER(ProcessEntry)]
        fn.restype = w.BOOL
    k.CloseHandle.argtypes = [w.HANDLE]
    k.CloseHandle.restype = w.BOOL
    handle = k.CreateToolhelp32Snapshot(2, 0)  # TH32CS_SNAPPROCESS
    if handle in (None, ctypes.c_void_p(-1).value):
        return None
    try:
        entry = ProcessEntry()
        entry.dwSize = ctypes.sizeof(entry)
        if not k.Process32FirstW(handle, ctypes.byref(entry)):
            return None
        names = []
        while True:
            names.append(entry.szExeFile)
            if not k.Process32NextW(handle, ctypes.byref(entry)):
                # ERROR_NO_MORE_FILES is the only successful end of enumeration.
                return names if ctypes.get_last_error() == 18 else None
    finally:
        k.CloseHandle(handle)


class GameProbe:
    """Bound process enumeration overhead while rechecking an already-open mapping."""
    def __init__(self, processes=windows_process_names, clock=time.monotonic, interval=0.25):
        self.processes, self.clock, self.interval = processes, clock, interval
        self.next_check = 0.0
        self.identity = None

    def __call__(self):
        now = self.clock()
        if now >= self.next_check:
            try:
                self.identity = identify_processes(self.processes())
            except OSError:
                self.identity = None
            self.next_check = now + self.interval
        return self.identity


def validate_source(track, car, simulator=None, identity=None):
    """Reject explicit foreign provenance and unmistakable AC mod keys in old files too."""
    if simulator is not None and simulator != "acc":
        raise ValueError("Not an Assetto Corsa Competizione recording; upload skipped.")
    if identity is not None:
        if not isinstance(identity, dict) or identity.get("simulator") != "acc" or identity.get("method") != "windows-process" or str(identity.get("executable", "")).casefold() not in ACC_EXECUTABLES:
            raise ValueError("Recording does not have a supported ACC process identity; upload skipped.")
    if any(str(key or "").casefold().startswith(("acu_", "acu ", "ks_")) for key in (track, car)):
        raise ValueError("Assetto Corsa/mod track or car detected, not ACC; upload skipped.")
