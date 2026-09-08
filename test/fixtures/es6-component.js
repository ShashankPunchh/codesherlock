export class UserModel {
  constructor(data) {
    this.data = data;
  }

  isMemberEditable() {
    return true;
  }

  static fromJson(json) {
    return new UserModel(json);
  }
}
