from .cppreference import CppreferenceTool
from .gmail import GmailTool
from .html_css import HtmlCssTool
from .io_operations import IoOperationsTool
from .news import NewsTool
from .programming_help import ProgrammingHelpTool
from .python_docs import PythonDocsTool
from .weather import WeatherTool
from .windows_support import WindowsSupportTool

TOOL_EXECUTORS = {
    tool.name: tool.execute
    for tool in [
        WeatherTool(),
        CppreferenceTool(),
        PythonDocsTool(),
        WindowsSupportTool(),
        ProgrammingHelpTool(),
        HtmlCssTool(),
        IoOperationsTool(),
        NewsTool(),
        GmailTool(),
    ]
}

__all__ = ["TOOL_EXECUTORS"]
