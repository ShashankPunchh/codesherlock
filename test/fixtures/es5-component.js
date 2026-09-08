function LocationScene(props) {
  this.props = props;
}

LocationScene.prototype.componentDidMount = function () {
  this.fetchStoreLocations();
};

LocationScene.prototype.render = function () {
  return null;
};

module.exports = { LocationScene };
