import { randomInterval } from "../utils";

describe("utils", () => {
  describe("randomInterval", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);
      jest.spyOn(global, "setTimeout");
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.spyOn(global.Math, "random").mockRestore();
    });

    it("should set timeout with average of bounds when Math.random returns 0.5", () => {
      const callback = jest.fn();
      const lower = 1000;
      const upper = 2000;
      const expected = 1500; // (1000 + 2000) / 2

      randomInterval(callback, lower, upper);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), expected);
    });

    it("should execute callback when timer fires", () => {
      const callback = jest.fn();
      randomInterval(callback, 1000, 2000);

      jest.runOnlyPendingTimers();

      expect(callback).toHaveBeenCalled();
    });

    it("should set new timeout after callback executes", () => {
      const callback = jest.fn();
      randomInterval(callback, 1000, 2000);

      jest.runOnlyPendingTimers();

      expect(setTimeout).toHaveBeenCalledTimes(2);
    });

    it("should throw error if lower bound is greater than upper bound", () => {
      const callback = jest.fn();
      expect(() => randomInterval(callback, 2000, 1000)).toThrow(
        "Lower bound cannot be greater than upper bound.",
      );
    });

    it("should use different intervals when Math.random returns different values", () => {
      const callback = jest.fn();
      const lower = 1000;
      const upper = 2000;

      // First call with Math.random = 0.5
      randomInterval(callback, lower, upper);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1500);

      // Second call with Math.random = 0.25
      jest.spyOn(global.Math, "random").mockReturnValue(0.25);
      randomInterval(callback, lower, upper);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1250);

      // Third call with Math.random = 0.75
      jest.spyOn(global.Math, "random").mockReturnValue(0.75);
      randomInterval(callback, lower, upper);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1750);
    });

    it("should handle equal lower and upper bounds", () => {
      const callback = jest.fn();
      const bound = 1000;

      randomInterval(callback, bound, bound);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), bound);
    });

    it("should return timer that can be cleared", () => {
      const callback = jest.fn();
      const timer = randomInterval(callback, 1000, 5000);

      clearTimeout(timer.timer);
      jest.runAllTimers();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
