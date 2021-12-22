# luogu-painter(1)

## Name

luogu-painter - paint images on
[Luogu paint board](https://www.luogu.com.cn/paintboard).

## Installation

Make sure you [have Deno installed](https://deno.land/#installation), and then
run the following in a terminal:

<pre><code>deno install --allow-read --allow-net https://cdn.jsdelivr.net/gh/sjx233/luogu-painter@main/main.ts</code></pre>

## Synopsis

<pre><code><b>luogu-painter</b> [<i>OPTION</i>]... <i>FILE</i> <i>X</i> <i>Y</i></code></pre>

## Description

**luogu-painter** tries to draw _FILE_ on Luogu paint board at position (_X_,
_Y_) if provided tokens. _FILE_ should be a 32-bit RGBA PNG image.

## Options

- <code><b>-s</b> <i>FILE</i></code>, <code><b>--tokens=</b><i>FILE</i></code>

  Read tokens from _FILE_, one per line. Empty lines and lines starting with `#`
  are ignored.

- <code><b>-r</b></code>, <code><b>--randomize</b></code>

  Pick pixels to draw next randomly instead of sequentially.

- <code><b>-t</b> <i>NUMBER</i></code>,
  <code><b>--cooldown=</b><i>NUMBER</i></code>

  For each token, pause for _NUMBER_ milliseconds after drawing a pixel.

- <code><b>-p</b> <i>FILE</i></code>, <code><b>--preview=</b><i>FILE</i></code>

  Periodically save a preview of how the image would be drawn to _FILE_.

- <code><b>-h</b></code>, <code><b>--help</b></code>

  Display a summary of options and exit.

## Examples

Assuming `tokens.txt` includes the following contents:

```text
# these are the tokens
585e035f4d4487a9f20833691a3afe7df593134d
c41413a2796265824bc43c48f38517efe173e61f
```

To draw an image at position (800, 400) using the 2 tokens, with the order of
pixels randomized, while also generating a preview:

<pre><code>luogu-painter -s tokens.txt -r -p preview.png image.png 800 400</code></pre>

## See Also

- GitHub repository: <https://github.com/sjx233/luogu-painter>.
