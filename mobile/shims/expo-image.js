const React = require("react");
const { Image: RNImage } = require("react-native");

function mapContentFitToResizeMode(contentFit) {
  switch (contentFit) {
    case "contain":
      return "contain";
    case "fill":
      return "stretch";
    case "none":
      return "center";
    case "cover":
    default:
      return "cover";
  }
}

const Image = React.forwardRef(function ExpoImageShim(props, ref) {
  const { contentFit, transition, cachePolicy, recyclingKey, ...rest } = props;

  return React.createElement(RNImage, {
    ...rest,
    ref,
    resizeMode: mapContentFitToResizeMode(contentFit),
  });
});

exports.Image = Image;
exports.default = Image;
