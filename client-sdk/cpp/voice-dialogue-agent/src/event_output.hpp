#pragma once

#include <eva/events.hpp>
#include <iosfwd>
#include <string_view>

void show_error(std::ostream &output, std::string_view action,
                const eva::Error &error);
void show_event(const eva::AgentEvent &event);
