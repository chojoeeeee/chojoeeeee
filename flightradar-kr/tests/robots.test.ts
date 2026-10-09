import { describe, expect, it } from "vitest";
import { isPathAllowed } from "@/providers/robots";

const UA = "FlightRadarKR/0.1";

describe("robots.txt evaluation", () => {
  it("allows everything when there are no rules or no robots file", () => {
    expect(isPathAllowed("", "/anything", UA)).toBe(true);
    expect(isPathAllowed("User-agent: *\nDisallow:", "/x", UA)).toBe(true);
  });
  it("applies Disallow to the * group and honours longest-match Allow overrides", () => {
    const txt = "User-agent: *\nDisallow: /private\nAllow: /private/public";
    expect(isPathAllowed(txt, "/private/a", UA)).toBe(false);
    expect(isPathAllowed(txt, "/private/public/a", UA)).toBe(true);
    expect(isPathAllowed(txt, "/open", UA)).toBe(true);
  });
  it("blocks everything with Disallow: /", () => {
    expect(isPathAllowed("User-agent: *\nDisallow: /", "/", UA)).toBe(false);
  });
  it("prefers a group naming our user agent over *", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: FlightRadarKR\nAllow: /";
    expect(isPathAllowed(txt, "/deals", UA)).toBe(true);
    expect(isPathAllowed(txt, "/deals", "OtherBot/1.0")).toBe(false);
  });
  it("supports * and $ wildcards and ignores comments / CRLF", () => {
    const txt = "# c\r\nUser-agent: *\r\nDisallow: /*.json$ # no json\r\nDisallow: /tmp*/x\r\n";
    expect(isPathAllowed(txt, "/data.json", UA)).toBe(false);
    expect(isPathAllowed(txt, "/data.json?x=1", UA)).toBe(true);
    expect(isPathAllowed(txt, "/tmp123/x", UA)).toBe(false);
  });
  it("treats the query string as part of the path", () => {
    expect(isPathAllowed("User-agent: *\nDisallow: /list?page=", "/list?page=2", UA)).toBe(false);
  });
  it("multiple User-agent lines share one group", () => {
    const txt = "User-agent: a\nUser-agent: flightradarkr\nDisallow: /no";
    expect(isPathAllowed(txt, "/no", UA)).toBe(false);
  });
});
