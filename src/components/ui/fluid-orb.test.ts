// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FluidOrb from "./fluid-orb";

function createContext() {
  return {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713,
    LINK_STATUS: 35714, ARRAY_BUFFER: 34962, STATIC_DRAW: 35044,
    FLOAT: 5126, TRIANGLES: 4,
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => "compile failure"),
    attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(() => "link failure"),
    useProgram: vi.fn(), bindBuffer: vi.fn(), bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0), enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})), uniform3f: vi.fn(), uniform2f: vi.fn(), uniform1f: vi.fn(),
    viewport: vi.fn(), drawArrays: vi.fn(),
    deleteProgram: vi.fn(), deleteShader: vi.fn(), deleteBuffer: vi.fn(),
    isContextLost: vi.fn(() => false),
  };
}

describe("Fluid Orb", () => {
  let gl: ReturnType<typeof createContext>;
  let motion: EventTarget & { matches: boolean };

  beforeEach(() => {
    gl = createContext();
    motion = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    vi.stubGlobal("matchMedia", vi.fn(() => motion));
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("mounts and releases every allocated resource on unmount", () => {
    const { unmount, container } = render(React.createElement(FluidOrb, { size: 120, color: "#f00" }));
    expect(container.querySelector("canvas")?.width).toBe(120);
    expect(gl.uniform3f.mock.calls[0]?.slice(1)).toEqual([1, 0, 0]);
    expect(gl.drawArrays).toHaveBeenCalled();
    unmount();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const draws = gl.drawArrays.mock.calls.length;
    act(() => motion.dispatchEvent(new Event("change")));
    expect(gl.drawArrays).toHaveBeenCalledTimes(draws);
  });

  it("cleans up both mount cycles under React Strict Mode", () => {
    const { unmount } = render(React.createElement(React.StrictMode, null, React.createElement(FluidOrb)));
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    unmount();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(4);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
  });

  it.each(["#12zzzz", "+12345", "abc#12"])("rejects malformed hex color %s", (color) => {
    render(React.createElement(FluidOrb, { color }));
    expect(gl.uniform3f.mock.calls[0]?.slice(1)).toEqual([0.1, 0.45, 0.95]);
  });

  it("cleans up the program and surviving shader after compilation failure", () => {
    gl.getShaderParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
    render(React.createElement(FluidOrb));
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it("cleans up after program linking failure", () => {
    gl.getProgramParameter.mockReturnValue(false);
    render(React.createElement(FluidOrb));
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it("does not render when buffer allocation fails", () => {
    gl.createBuffer.mockReturnValue(null as unknown as object);
    render(React.createElement(FluidOrb));
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("uses valid dimensions for size %s", (size) => {
    const { container } = render(React.createElement(FluidOrb, { size }));
    expect(container.querySelector("canvas")?.width).toBe(240);
    expect((container.firstElementChild as HTMLElement).style.width).toBe("240px");
  });

  it("honors reduced motion at mount", () => {
    motion.matches = true;
    render(React.createElement(FluidOrb));
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("renders a still frame without an animation loop when explicitly paused", () => {
    render(React.createElement(FluidOrb, { animated: false }));
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    act(() => motion.dispatchEvent(new Event("change")));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("cleans up its animation when switched to a still frame", () => {
    const { rerender } = render(React.createElement(FluidOrb));
    vi.mocked(requestAnimationFrame).mockClear();
    rerender(React.createElement(FluidOrb, { animated: false }));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("stops and resumes when reduced motion changes while mounted", () => {
    render(React.createElement(FluidOrb));
    vi.mocked(cancelAnimationFrame).mockClear();
    motion.matches = true;
    act(() => motion.dispatchEvent(new Event("change")));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    vi.mocked(requestAnimationFrame).mockClear();
    motion.matches = false;
    act(() => motion.dispatchEvent(new Event("change")));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("reinitializes resources when the WebGL context is restored", () => {
    const { container } = render(React.createElement(FluidOrb));
    const canvas = container.querySelector("canvas")!;
    const event = new Event("webglcontextlost", { cancelable: true });
    act(() => canvas.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    act(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });
});
