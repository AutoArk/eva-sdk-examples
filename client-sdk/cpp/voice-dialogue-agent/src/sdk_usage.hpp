#pragma once
#include "options.hpp"
#include <eva/agent.hpp>
#include <memory>
#include <string>

eva::Result<std::unique_ptr<eva::Agent>> create_agent(std::string key,
                                                      const Options &options);
