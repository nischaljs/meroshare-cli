# platform/context

`createContext()` builds the store, the MeroShare client and the notifier once and hands them to every command handler and automation step as `AppContext`. Tests build it with a temp `IPO_HOME`, a fake MeroShare base, a fake email transport and a no-wait `sleep`.
