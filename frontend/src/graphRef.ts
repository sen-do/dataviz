import { createRef } from "react";

// Singleton ref for the Cosmograph instance.
// Shared between GraphView (attaches it) and Sidebar (calls focusPoint etc.).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cosmographRef = createRef<any>();
