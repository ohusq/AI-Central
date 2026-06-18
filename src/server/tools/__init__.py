from .weather import WeatherTool
from .cppreference import CppreferenceTool
from .python_docs import PythonDocsTool
from .windows_support import WindowsSupportTool
from .programming_help import ProgrammingHelpTool
from .html_css import HtmlCssTool
from .io_operations import IoOperationsTool
from .news import NewsTool

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
    ]
}

__all__ = ["TOOL_EXECUTORS"]
