#!/usr/bin/env python3
"""Fast local GLSL sanity check for the core shaders.

glslangValidator is the real gate (tools/check_shaders.py) but it is not installed everywhere.
This catches the mistakes that actually happen while editing by hand: unbalanced brackets, calling a
function that is not defined above the call site, and using an identifier that was never declared.
It stays deliberately conservative so it can run in CI beside the real compiler.
"""
from __future__ import annotations
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "src/main/resources/assets/beyond/shaders/core"
TYPES = {"void", "float", "int", "uint", "bool", "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4",
         "uvec2", "uvec3", "uvec4", "bvec2", "bvec3", "bvec4", "mat2", "mat3", "mat4",
         "mat2x3", "mat3x2", "sampler2D", "sampler3D", "samplerCube", "isampler2D", "usampler2D"}
KEYWORDS = {"if", "for", "while", "switch", "return", "struct", "else", "do", "case", "default", "break",
            "continue", "discard", "in", "out", "inout", "const", "uniform", "varying", "attribute", "layout",
            "flat", "smooth", "lowp", "mediump", "highp", "true", "false"}
BUILTINS = {
    "abs", "acos", "all", "any", "asin", "atan", "ceil", "clamp", "cos", "cosh", "cross", "degrees",
    "determinant", "distance", "dot", "dFdx", "dFdy", "equal", "exp", "exp2", "faceforward", "floor",
    "fract", "fwidth", "greaterThan", "greaterThanEqual", "inverse", "isinf", "isnan", "length", "log",
    "log2", "matrixCompMult", "max", "min", "mix", "mod", "modf", "normalize", "not", "notEqual", "pow",
    "radians", "reflect", "refract", "round", "sign", "sin", "sinh", "smoothstep", "sqrt", "step", "tan",
    "tanh", "texelFetch", "texture", "textureLod", "textureSize", "transpose", "trunc", "vec2", "vec3",
    "vec4", "ivec2", "ivec3", "ivec4", "mat2", "mat3", "mat4", "float", "int", "bool", "uint", "main",
    "gl_Position", "gl_FragCoord", "gl_FrontFacing", "gl_PointCoord", "gl_VertexID", "gl_InstanceID",
    "gl_PrimitiveID", "gl_Layer", "gl_SampleID", "gl_SamplePosition", "gl_SampleMask", "gl_FragDepth",
    "gl_ClipDistance", "gl_PointSize",
}
TOKEN = re.compile(r"[A-Za-z_]\w*|[(),;\[\]]|=|\{|\}")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def declared_in_statement(statement: str, types: set[str]) -> set[str]:
    """Names introduced by a C-style declaration, including comma-separated declarators."""
    names: set[str] = set()
    tokens = [match.group(0) for match in TOKEN.finditer(statement)]
    start = next((index for index, token in enumerate(tokens) if token in types), None)
    if start is None:
        return names
    depth, expecting, index = 0, True, start + 1
    while index < len(tokens):
        token = tokens[index]
        if token in ("(", "["):
            depth += 1
        elif token in (")", "]"):
            if depth == 0:
                break
            depth -= 1
        elif token in (";", "{"):
            break
        elif depth == 0 and expecting and re.fullmatch(r"[A-Za-z_]\w*", token):
            names.add(token); expecting = False
        elif depth == 0 and token == "=":
            index += 1
            inner = 0
            while index < len(tokens):
                current = tokens[index]
                if current in ("(", "["):
                    inner += 1
                elif current in (")", "]"):
                    if inner == 0:
                        break
                    inner -= 1
                elif inner == 0 and current == ",":
                    expecting = True; break
                elif inner == 0 and current == ";":
                    return names
                index += 1
        elif depth == 0 and token == ",":
            expecting = True
        index += 1
    return names


def declared_names(source: str, structs: set[str]) -> set[str]:
    types = TYPES | structs
    names: set[str] = set()
    for match in re.finditer(r"^\s*(?:uniform|in|out|const|varying|attribute)\s+[A-Za-z_]\w*\s+([A-Za-z_]\w*)", source, flags=re.M):
        names.add(match.group(1))
    for match in re.finditer(r"^\s*(?:[A-Za-z_]\w*\s+)+([A-Za-z_]\w*)\s*\(([^;{)]*)\)\s*\{", source, flags=re.M):
        for parameter in match.group(2).split(","):
            tokens = [token for token in re.findall(r"[A-Za-z_]\w*", parameter) if token not in KEYWORDS and token not in types]
            if tokens:
                names.add(tokens[-1])
    for statement in re.split(r"[;{}]", source):
        names |= declared_in_statement(statement, types)
    return names


def check(path: Path) -> list[str]:
    problems: list[str] = []
    source = strip_comments(path.read_text())
    for opening, closing in (("{", "}"), ("(", ")"), ("[", "]")):
        if source.count(opening) != source.count(closing):
            problems.append(f"{path.name}: unbalanced {opening}{closing} ({source.count(opening)} vs {source.count(closing)})")
    definitions: dict[str, int] = {}
    structs: set[str] = set()
    for match in re.finditer(r"^\s*struct\s+([A-Za-z_]\w*)", source, flags=re.M):
        definitions.setdefault(match.group(1), source[:match.start()].count("\n") + 1)
        structs.add(match.group(1))
    for match in re.finditer(r"^\s*(?:[A-Za-z_]\w*\s+)+([A-Za-z_]\w*)\s*\(([^;{)]*)\)\s*\{", source, flags=re.M):
        definitions.setdefault(match.group(1), source[:match.start()].count("\n") + 1)
    known = declared_names(source, structs) | structs | TYPES | BUILTINS | set(definitions)
    for index, line in enumerate(source.split("\n"), start=1):
        body = line.strip()
        if body.startswith("#") or re.match(r"^(uniform|struct|layout|in|out)\s", body):
            continue
        for call in re.finditer(r"(?<![\w.])([A-Za-z_]\w*)\s*\(", line):
            name = call.group(1)
            if name in known or name in KEYWORDS:
                continue
            if name in definitions and definitions[name] <= index:
                continue
            problems.append(f"{path.name}:{index}: {name}() is not defined above this line")
        for token in re.finditer(r"(?<![\w.])([A-Za-z_]\w*)\b(?!\s*\()", line):
            name = token.group(1)
            if name in known or name in KEYWORDS:
                continue
            if re.search(r"\.\s*" + re.escape(name) + r"\b", line):  # struct member access
                continue
            problems.append(f"{path.name}:{index}: {name} is not declared")
    return problems


def main() -> int:
    problems: list[str] = []
    for path in sorted(ROOT.glob("*.fsh")) + sorted(ROOT.glob("*.vsh")):
        problems.extend(check(path))
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        return 1
    print(f"PASS: {len(list(ROOT.glob('*.fsh')) + list(ROOT.glob('*.vsh')))} core shaders parse and use only declared identifiers.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
